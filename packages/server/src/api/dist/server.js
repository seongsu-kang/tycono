import { COMPANY_ROOT } from './services/file-reader.js';
import { applyConfig } from './services/company-config.js';
import { createHttpServer } from './create-server.js';
// Load .tycono/config.json and apply to process.env
const config = applyConfig(COMPANY_ROOT);
console.log(`[STARTUP] Engine: ${config.engine}, API key: ${config.apiKey ? 'set' : 'none'}`);
const PORT = Number(process.env.PORT) || 3001;
const server = createHttpServer();
server.listen(PORT, () => {
    console.log(`[API] Server running on http://localhost:${PORT}`);
    console.log(`[API] COMPANY_ROOT: ${COMPANY_ROOT}`);
});
