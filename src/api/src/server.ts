import { COMPANY_ROOT } from './services/file-reader.js';
import { applyConfig } from './services/company-config.js';
import { createHttpServer } from './create-server.js';
import { listSessions, updateSession } from './services/session-store.js';
import { ActivityStream } from './services/activity-stream.js';

// Load .tycono/config.json and apply to process.env
const config = applyConfig(COMPANY_ROOT);
console.log(`[STARTUP] Engine: ${config.engine}, API key: ${config.apiKey ? 'set' : 'none'}`);

// Startup: mark orphaned 'active' sessions as 'interrupted'
// These are sessions from a previous server that crashed or was killed
{
  const allSessions = listSessions();
  let orphaned = 0;
  for (const ses of allSessions) {
    if (ses.status !== 'active') continue;
    // Check activity stream — if it has msg:done/msg:error, mark done
    // If not, mark interrupted (previous server died mid-execution)
    if (ActivityStream.exists(ses.id)) {
      const events = ActivityStream.readFrom(ses.id, 0);
      const tail = events.slice(-5);
      const isDone = tail.some(e => e.type === 'msg:done' || e.type === 'msg:error');
      if (isDone) {
        updateSession(ses.id, { status: 'closed' });
        orphaned++;
        continue;
      }
    }
    updateSession(ses.id, { status: 'closed' });
    orphaned++;
  }
  if (orphaned > 0) {
    console.log(`[STARTUP] Cleaned ${orphaned} orphaned sessions (active → done/interrupted)`);
  }
}

const PORT = Number(process.env.PORT) || 3001;
const server = createHttpServer();

server.listen(PORT, () => {
  console.log(`[API] Server running on http://localhost:${PORT}`);
  console.log(`[API] COMPANY_ROOT: ${COMPANY_ROOT}`);
});

// Graceful shutdown: mark running sessions as interrupted
function gracefulShutdown(signal: string) {
  console.log(`[SHUTDOWN] ${signal} received, marking active sessions as interrupted...`);
  const sessions = listSessions();
  for (const ses of sessions) {
    if (ses.status === 'active') {
      updateSession(ses.id, { status: 'interrupted' as any });
    }
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
