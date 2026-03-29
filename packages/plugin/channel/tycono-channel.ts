#!/usr/bin/env bun
/**
 * Tycono Channel — MCP Channel server
 *
 * Bridges Tycono server SSE events to the user's Claude Code session.
 * - Pushes: awaiting_input, errors, wave completion, risky actions
 * - Reply tool: user responds → Tycono server API → agent resumes
 *
 * Architecture: https://code.claude.com/docs/en/channels-reference
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// --- Config ---

const PUSH_EVENTS = new Set([
  "msg:awaiting_input",
  "msg:error",
  "msg:done",
  "dispatch:error",
  "action:risky",
]);

// Resolve server URL from headless.json
function getServerUrl(): string | null {
  // Check project-local first, then home
  const candidates = [
    join(process.cwd(), ".tycono", "headless.json"),
    join(process.env.HOME || "~", ".tycono", "headless.json"),
  ];

  // Also walk up from cwd to find CLAUDE.md parent
  let dir = process.cwd();
  while (dir !== "/") {
    const candidate = join(dir, ".tycono", "headless.json");
    if (!candidates.includes(candidate)) candidates.unshift(candidate);

    if (existsSync(join(dir, "CLAUDE.md"))) break;
    if (existsSync(join(dir, "knowledge", "CLAUDE.md"))) {
      const knowledgeCandidate = join(dir, ".tycono", "headless.json");
      if (!candidates.includes(knowledgeCandidate))
        candidates.unshift(knowledgeCandidate);
      break;
    }
    dir = join(dir, "..");
  }

  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, "utf-8"));
        if (data.port) return `http://localhost:${data.port}`;
      }
    } catch {}
  }
  return null;
}

// --- MCP Server ---

const mcp = new Server(
  { name: "tycono", version: "0.0.1" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: `Tycono AI 팀의 실시간 이벤트가 <channel source="tycono"> 태그로 도착합니다.

type별 대응:
- "awaiting_input": 에이전트가 유저 결정을 기다리고 있습니다. 내용을 읽고 유저에게 알린 뒤, 유저가 응답하면 tycono_reply tool로 전달하세요. session_id를 반드시 포함하세요.
- "msg:error": 에이전트 세션에서 에러가 발생했습니다. 유저에게 알리세요.
- "msg:done": wave가 완료되었습니다. 유저에게 결과를 알리세요.
- "dispatch:error": 팀 dispatch가 실패했습니다. 유저에게 알리세요.
- "action:risky": 위험한 명령(SSH, rm -rf 등)이 실행되고 있습니다. 유저에게 경고하세요.

중요: awaiting_input에만 reply가 필요하고, 나머지는 알림만 하면 됩니다.`,
  }
);

// --- Reply Tool ---

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "tycono_reply",
      description:
        "Tycono 에이전트에게 유저의 응답을 전달합니다. awaiting_input 이벤트에 대한 응답 시 사용하세요.",
      inputSchema: {
        type: "object" as const,
        properties: {
          session_id: {
            type: "string",
            description: "응답할 세션 ID (channel 태그의 session_id 속성)",
          },
          message: {
            type: "string",
            description: "유저의 응답 메시지",
          },
        },
        required: ["session_id", "message"],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "tycono_reply") {
    const { session_id, message } = req.params.arguments as {
      session_id: string;
      message: string;
    };

    const serverUrl = getServerUrl();
    if (!serverUrl) {
      return {
        content: [
          {
            type: "text" as const,
            text: "❌ Tycono 서버를 찾을 수 없습니다. /tycono로 wave를 먼저 시작하세요.",
          },
        ],
      };
    }

    try {
      const res = await fetch(
        `${serverUrl}/api/sessions/${session_id}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        }
      );

      if (!res.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ 응답 전달 실패: ${res.status} ${res.statusText}`,
            },
          ],
        };
      }

      return {
        content: [
          { type: "text" as const, text: "✅ 응답이 에이전트에게 전달되었습니다." },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ 서버 통신 에러: ${e.message}`,
          },
        ],
      };
    }
  }
  throw new Error(`unknown tool: ${req.params.name}`);
});

// --- Connect ---

await mcp.connect(new StdioServerTransport());

// --- SSE Subscription ---

interface TyconoEvent {
  type: string;
  data: string;
  sessionId?: string;
  roleId?: string;
  waveId?: string;
}

function parseSSEChunk(chunk: string): TyconoEvent[] {
  const events: TyconoEvent[] = [];
  const lines = chunk.split("\n");
  let currentEvent: Partial<TyconoEvent> = {};
  let dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent.type = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    } else if (line === "" && (currentEvent.type || dataLines.length > 0)) {
      const rawData = dataLines.join("\n");
      try {
        const parsed = JSON.parse(rawData);
        events.push({
          type: currentEvent.type || parsed.type || "unknown",
          data:
            parsed.summary ||
            parsed.content ||
            parsed.message ||
            parsed.question ||
            rawData,
          sessionId: parsed.sessionId || parsed.session_id,
          roleId: parsed.roleId || parsed.role_id,
          waveId: parsed.waveId || parsed.wave_id,
        });
      } catch {
        events.push({
          type: currentEvent.type || "unknown",
          data: rawData,
        });
      }
      currentEvent = {};
      dataLines = [];
    }
  }
  return events;
}

function formatEventContent(event: TyconoEvent): string {
  switch (event.type) {
    case "msg:awaiting_input":
      return `🔔 ${event.roleId || "에이전트"}가 결정을 기다리고 있습니다.\n\n${event.data}`;
    case "msg:error":
      return `❌ ${event.roleId || "에이전트"} 세션 에러:\n${event.data}`;
    case "msg:done":
      return `✅ Wave 완료.\n${event.data}`;
    case "dispatch:error":
      return `⚠️ Dispatch 실패:\n${event.data}`;
    case "action:risky":
      return `🚨 위험 행동 감지: ${event.roleId || "에이전트"}\n${event.data}`;
    default:
      return event.data;
  }
}

async function subscribeToWave(serverUrl: string) {
  try {
    // Find active wave
    const statusRes = await fetch(`${serverUrl}/api/exec/status`);
    if (!statusRes.ok) return;
    const status = await statusRes.json();

    const activeWaveId =
      status.activeWaveId ||
      status.waveId ||
      (status.waves && status.waves[0]?.id);
    if (!activeWaveId) return;

    // Subscribe to SSE stream
    const res = await fetch(`${serverUrl}/api/waves/${activeWaveId}/stream`);
    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const events = parseSSEChunk(chunk);

      for (const event of events) {
        if (PUSH_EVENTS.has(event.type)) {
          await mcp.notification({
            method: "notifications/claude/channel",
            params: {
              content: formatEventContent(event),
              meta: {
                type: event.type,
                session_id: event.sessionId || "",
                role_id: event.roleId || "",
                wave_id: event.waveId || "",
              },
            },
          });
        }
      }
    }
  } catch {
    // Stream ended or server not available — will retry
  }
}

// Poll for server availability and subscribe
async function pollAndSubscribe() {
  while (true) {
    const serverUrl = getServerUrl();
    if (serverUrl) {
      try {
        const health = await fetch(`${serverUrl}/api/health`);
        if (health.ok) {
          await subscribeToWave(serverUrl);
        }
      } catch {
        // Server not ready
      }
    }
    // Wait before retry (server might not be started yet, or wave ended)
    await new Promise((r) => setTimeout(r, 3000));
  }
}

pollAndSubscribe();
