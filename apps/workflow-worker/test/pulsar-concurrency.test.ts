import { describe, expect, it, vi } from "vitest";
import { startConcurrentReceiveLoops } from "../src/broker/pulsar.js";

describe("Pulsar consumer concurrency", () => {
  it("does not receive or handle more messages than maxInFlight", async () => {
    const values = [1, 2, 3, 4];
    const releases: Array<() => void> = [];
    let active = 0;
    let closing = false;
    let maximumActive = 0;
    const receive = vi.fn(async () => values.shift()!);
    const handle = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>(resolve => releases.push(resolve));
      active -= 1;
    });
    const loops = startConcurrentReceiveLoops({
      handle,
      isClosing: () => closing,
      maxInFlight: 2,
      receive,
    });

    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(2));
    expect(receive).toHaveBeenCalledTimes(2);
    releases.splice(0).forEach(release => release());
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(4));
    expect(maximumActive).toBe(2);

    closing = true;
    releases.splice(0).forEach(release => release());
    await Promise.all(loops);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid maxInFlight %s",
    (maxInFlight) => {
      expect(() => startConcurrentReceiveLoops({
        handle: async () => undefined,
        isClosing: () => true,
        maxInFlight,
        receive: async () => undefined,
      })).toThrow("Workflow broker maxInFlight must be a positive safe integer");
    },
  );
});
