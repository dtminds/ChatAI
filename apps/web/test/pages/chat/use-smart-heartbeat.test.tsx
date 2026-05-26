import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKBENCH_SMART_HEARTBEAT_INTERVAL_MS,
  useSmartHeartbeat,
} from "@/pages/chat/hooks/use-smart-heartbeat";

const sendSmartHeartbeat = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/pages/chat/api/workbench-gateway", () => ({
  sendSmartHeartbeat: (...args: unknown[]) => sendSmartHeartbeat(...args),
}));

function SmartHeartbeatHarness({
  conversationId,
  enabled = true,
  intervalMs = WORKBENCH_SMART_HEARTBEAT_INTERVAL_MS,
}: {
  conversationId?: string;
  enabled?: boolean;
  intervalMs?: number;
}) {
  useSmartHeartbeat({
    conversationId,
    enabled,
    intervalMs,
  });

  return null;
}

function setVisibilityState(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: visibilityState,
  });
}

describe("useSmartHeartbeat", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    sendSmartHeartbeat.mockClear();
    setVisibilityState("visible");
  });

  it("sends heartbeat immediately and on interval when enabled", async () => {
    vi.useFakeTimers();
    sendSmartHeartbeat.mockResolvedValue({ ok: true });

    render(<SmartHeartbeatHarness conversationId="conv-001" intervalMs={1000} />);

    await vi.waitFor(() => {
      expect(sendSmartHeartbeat).toHaveBeenCalledWith("conv-001");
    });
    expect(sendSmartHeartbeat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(sendSmartHeartbeat).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);

    expect(sendSmartHeartbeat).toHaveBeenCalledTimes(3);
  });

  it("does not send heartbeat when disabled", async () => {
    vi.useFakeTimers();

    render(<SmartHeartbeatHarness enabled={false} />);

    await vi.advanceTimersByTimeAsync(WORKBENCH_SMART_HEARTBEAT_INTERVAL_MS);
    expect(sendSmartHeartbeat).not.toHaveBeenCalled();
  });

  it("does not send heartbeat when conversation id is missing", async () => {
    vi.useFakeTimers();

    render(<SmartHeartbeatHarness conversationId={undefined} enabled />);

    await vi.advanceTimersByTimeAsync(WORKBENCH_SMART_HEARTBEAT_INTERVAL_MS);
    expect(sendSmartHeartbeat).not.toHaveBeenCalled();
  });

  it("keeps polling heartbeat while the document is hidden", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");

    render(<SmartHeartbeatHarness conversationId="conv-001" intervalMs={1000} />);

    await vi.waitFor(() => {
      expect(sendSmartHeartbeat).toHaveBeenCalledWith("conv-001");
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(sendSmartHeartbeat).toHaveBeenCalledTimes(2);
  });
});
