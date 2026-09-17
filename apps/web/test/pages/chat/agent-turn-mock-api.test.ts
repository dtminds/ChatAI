// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentTurnEventEnvelope } from "@chatai/contracts";
import { subscribeAgentTurnMockEvents } from "@/pages/chat/api/agent-turn-mock";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onerror: (() => void) | null = null;
  readonly close = vi.fn();
  private readonly listeners = new Map<string, EventListener>();

  constructor() {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    if (this.listeners.get(type) === listener) {
      this.listeners.delete(type);
    }
  }

  emit(envelope: AgentTurnEventEnvelope) {
    this.listeners.get("agent-turn")?.({
      data: JSON.stringify(envelope),
    } as MessageEvent<string>);
  }

  fail() {
    this.onerror?.();
  }
}

describe("agent turn mock SSE client", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not report an error after receiving a terminal event", () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const dispose = subscribeAgentTurnMockEvents("turn-1", {
      onError,
      onEvent,
    });
    const source = FakeEventSource.instances[0];

    source?.emit({
      event: {
        finishCallId: "call-finish",
        outcome: "reply",
        type: "turn.completed",
      },
      eventId: "turn-1:4",
      occurredAt: "2026-09-17T10:00:00.000Z",
      sequence: 4,
      turnId: "turn-1",
    });
    source?.fail();

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(source?.close).toHaveBeenCalledOnce();

    dispose();
  });
});
