/**
 * Tycono Channel — Unit Tests
 *
 * Run: npx tsx --test tycono-channel.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Inline the pure functions we need to test ---
// (Extracted from tycono-channel.ts for testability)

const PUSH_EVENTS = new Set([
  "msg:awaiting_input",
  "msg:error",
  "msg:done",
  "dispatch:error",
  "action:risky",
]);

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

// ============================================================
// Tests
// ============================================================

describe("parseSSEChunk", () => {
  it("parses a simple SSE event with JSON data", () => {
    const chunk = `event: msg:done
data: {"summary":"Wave completed","sessionId":"ses-ceo-001","roleId":"ceo"}

`;
    const events = parseSSEChunk(chunk);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "msg:done");
    assert.equal(events[0].data, "Wave completed");
    assert.equal(events[0].sessionId, "ses-ceo-001");
    assert.equal(events[0].roleId, "ceo");
  });

  it("parses awaiting_input event with question field", () => {
    const chunk = `event: msg:awaiting_input
data: {"question":"Option A or B?","sessionId":"ses-bt-123","roleId":"backtester"}

`;
    const events = parseSSEChunk(chunk);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "msg:awaiting_input");
    assert.equal(events[0].data, "Option A or B?");
    assert.equal(events[0].sessionId, "ses-bt-123");
    assert.equal(events[0].roleId, "backtester");
  });

  it("parses multiple events in one chunk", () => {
    const chunk = `event: msg:start
data: {"message":"Starting session"}

event: msg:done
data: {"summary":"Completed"}

`;
    const events = parseSSEChunk(chunk);
    assert.equal(events.length, 2);
    assert.equal(events[0].type, "msg:start");
    assert.equal(events[1].type, "msg:done");
  });

  it("handles non-JSON data gracefully", () => {
    const chunk = `event: msg:error
data: plain text error message

`;
    const events = parseSSEChunk(chunk);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "msg:error");
    assert.equal(events[0].data, "plain text error message");
  });

  it("handles multi-line data fields", () => {
    const chunk = `event: msg:error
data: {"message":"line1",
data: "detail":"line2"}

`;
    const events = parseSSEChunk(chunk);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "msg:error");
  });

  it("returns empty array for empty chunk", () => {
    const events = parseSSEChunk("");
    assert.equal(events.length, 0);
  });

  it("returns empty array for comment-only chunk", () => {
    const events = parseSSEChunk(": keepalive\n\n");
    assert.equal(events.length, 0);
  });

  it("handles event with snake_case IDs", () => {
    const chunk = `event: dispatch:error
data: {"content":"403 forbidden","session_id":"ses-eng-001","role_id":"engineer","wave_id":"wave-007"}

`;
    const events = parseSSEChunk(chunk);
    assert.equal(events.length, 1);
    assert.equal(events[0].sessionId, "ses-eng-001");
    assert.equal(events[0].roleId, "engineer");
    assert.equal(events[0].waveId, "wave-007");
  });
});

describe("PUSH_EVENTS filter", () => {
  it("includes awaiting_input", () => {
    assert.ok(PUSH_EVENTS.has("msg:awaiting_input"));
  });

  it("includes error events", () => {
    assert.ok(PUSH_EVENTS.has("msg:error"));
    assert.ok(PUSH_EVENTS.has("dispatch:error"));
  });

  it("includes done and risky", () => {
    assert.ok(PUSH_EVENTS.has("msg:done"));
    assert.ok(PUSH_EVENTS.has("action:risky"));
  });

  it("excludes noisy events", () => {
    assert.ok(!PUSH_EVENTS.has("msg:start"));
    assert.ok(!PUSH_EVENTS.has("msg:turn-complete"));
    assert.ok(!PUSH_EVENTS.has("tool:start"));
    assert.ok(!PUSH_EVENTS.has("tool:result"));
  });
});

describe("formatEventContent", () => {
  it("formats awaiting_input with role name", () => {
    const result = formatEventContent({
      type: "msg:awaiting_input",
      data: "Option A or B?",
      roleId: "backtester",
    });
    assert.ok(result.includes("🔔"));
    assert.ok(result.includes("backtester"));
    assert.ok(result.includes("Option A or B?"));
  });

  it("formats awaiting_input without role name", () => {
    const result = formatEventContent({
      type: "msg:awaiting_input",
      data: "Choose one",
    });
    assert.ok(result.includes("에이전트"));
  });

  it("formats error with role", () => {
    const result = formatEventContent({
      type: "msg:error",
      data: "Session crashed",
      roleId: "engineer",
    });
    assert.ok(result.includes("❌"));
    assert.ok(result.includes("engineer"));
  });

  it("formats wave done", () => {
    const result = formatEventContent({
      type: "msg:done",
      data: "All tasks completed",
    });
    assert.ok(result.includes("✅"));
    assert.ok(result.includes("Wave 완료"));
  });

  it("formats dispatch error", () => {
    const result = formatEventContent({
      type: "dispatch:error",
      data: "403 forbidden",
    });
    assert.ok(result.includes("⚠️"));
    assert.ok(result.includes("Dispatch 실패"));
  });

  it("formats risky action", () => {
    const result = formatEventContent({
      type: "action:risky",
      data: "ssh deploy@prod",
      roleId: "backtester",
    });
    assert.ok(result.includes("🚨"));
    assert.ok(result.includes("backtester"));
  });

  it("returns raw data for unknown types", () => {
    const result = formatEventContent({
      type: "unknown:event",
      data: "some data",
    });
    assert.equal(result, "some data");
  });
});

describe("Integration: SSE → filter → format pipeline", () => {
  it("end-to-end: SSE chunk → filtered events → formatted output", () => {
    const chunk = `event: msg:start
data: {"message":"Starting"}

event: msg:awaiting_input
data: {"question":"Deploy to prod?","sessionId":"ses-eng-001","roleId":"engineer"}

event: msg:turn-complete
data: {"turn":5}

event: msg:error
data: {"message":"Out of memory","roleId":"qa"}

`;
    const allEvents = parseSSEChunk(chunk);
    assert.equal(allEvents.length, 4);

    const pushEvents = allEvents.filter((e) => PUSH_EVENTS.has(e.type));
    assert.equal(pushEvents.length, 2); // awaiting_input + error

    assert.equal(pushEvents[0].type, "msg:awaiting_input");
    assert.equal(pushEvents[1].type, "msg:error");

    const formatted0 = formatEventContent(pushEvents[0]);
    assert.ok(formatted0.includes("engineer"));
    assert.ok(formatted0.includes("Deploy to prod?"));

    const formatted1 = formatEventContent(pushEvents[1]);
    assert.ok(formatted1.includes("qa"));
    assert.ok(formatted1.includes("Out of memory"));
  });
});
