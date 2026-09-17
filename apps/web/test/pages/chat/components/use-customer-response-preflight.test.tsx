// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type {
  CustomerResponsePreflightResponse,
} from "@chatai/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCustomerResponsePreflight } from "@/pages/chat/components/use-customer-response-preflight";
import type { ChatMessage } from "@/pages/chat/chat-types";

const { requestCustomerResponsePreflightMock } = vi.hoisted(() => ({
  requestCustomerResponsePreflightMock: vi.fn(),
}));

vi.mock("@/pages/chat/api/customer-response-preflight", () => ({
  requestCustomerResponsePreflight: requestCustomerResponsePreflightMock,
}));

describe("useCustomerResponsePreflight", () => {
  afterEach(() => {
    requestCustomerResponsePreflightMock.mockReset();
    vi.useRealTimers();
  });

  it("debounces the request and passes the selected direction to the accept callback", async () => {
    vi.useFakeTimers();
    const message = createCustomerMessage(7003);
    const response = createResponse("request_information");
    const deferred = createDeferred<CustomerResponsePreflightResponse>();
    requestCustomerResponsePreflightMock.mockReturnValue(deferred.promise);
    const onAccept = vi.fn();
    const { result } = renderHook(() =>
      useCustomerResponsePreflight({
        blocked: false,
        conversationId: "144",
        enabled: true,
        messages: [message],
        onAccept,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_499);
    });
    expect(requestCustomerResponsePreflightMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.phase).toBe("analyzing");
    expect(requestCustomerResponsePreflightMock).toHaveBeenCalledWith(
      { conversationId: "144", triggerMessageId: "7003" },
      expect.any(AbortSignal),
    );

    await act(async () => {
      deferred.resolve(response);
      await deferred.promise;
    });
    expect(result.current).toMatchObject({
      direction: "request_information",
      label: "客户需要补充信息",
      phase: "confirmation",
    });

    await act(async () => {
      result.current.accept();
      await Promise.resolve();
    });

    expect(onAccept).toHaveBeenCalledWith({
      direction: "request_information",
      message,
    });
    expect(result.current.phase).toBe("idle");
  });

  it("cancels an old request and clears its confirmation when a newer customer message arrives", async () => {
    vi.useFakeTimers();
    const firstMessage = createCustomerMessage(7003);
    const secondMessage = createCustomerMessage(7004);
    const firstDeferred = createDeferred<CustomerResponsePreflightResponse>();
    const secondDeferred = createDeferred<CustomerResponsePreflightResponse>();
    requestCustomerResponsePreflightMock.mockReturnValueOnce(
      firstDeferred.promise,
    );
    requestCustomerResponsePreflightMock.mockReturnValue(secondDeferred.promise);
    const { result, rerender } = renderHook(
      ({ messages }: { messages: ChatMessage[] }) =>
        useCustomerResponsePreflight({
          blocked: false,
          conversationId: "144",
          enabled: true,
          messages,
          onAccept: vi.fn(),
        }),
      { initialProps: { messages: [firstMessage] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    const firstSignal = requestCustomerResponsePreflightMock.mock.calls[0]?.[
      1
    ] as AbortSignal;

    rerender({ messages: [firstMessage, secondMessage] });

    expect(firstSignal.aborted).toBe(true);
    expect(result.current.phase).toBe("idle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(requestCustomerResponsePreflightMock).toHaveBeenCalledTimes(2);
    expect(requestCustomerResponsePreflightMock.mock.calls[1]?.[0]).toEqual({
      conversationId: "144",
      triggerMessageId: "7004",
    });
  });

  it("does not restart the debounce when the same message is recreated", async () => {
    vi.useFakeTimers();
    const message = createCustomerMessage(7003);
    const deferred = createDeferred<CustomerResponsePreflightResponse>();
    requestCustomerResponsePreflightMock.mockReturnValue(deferred.promise);
    const { rerender } = renderHook(
      ({ messages }: { messages: ChatMessage[] }) =>
        useCustomerResponsePreflight({
          blocked: false,
          conversationId: "144",
          enabled: true,
          messages,
          onAccept: vi.fn(),
        }),
      { initialProps: { messages: [message] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(requestCustomerResponsePreflightMock).toHaveBeenCalledTimes(1);

    rerender({
      messages: [
        {
          ...message,
          content: { text: "更新后的展示", type: "text" },
        },
      ],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(requestCustomerResponsePreflightMock).toHaveBeenCalledTimes(1);
  });

  it("returns to waiting when the backend rejects a stale trigger", async () => {
    vi.useFakeTimers();
    requestCustomerResponsePreflightMock.mockRejectedValue({ status: 400 });
    const { result } = renderHook(() =>
      useCustomerResponsePreflight({
        blocked: false,
        conversationId: "144",
        enabled: true,
        messages: [createCustomerMessage(7003)],
        onAccept: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.isActive).toBe(false);
  });
});

function createCustomerMessage(seq: number): ChatMessage {
  return {
    author: "客户",
    content: { text: `消息 ${seq}`, type: "text" },
    conversationId: "144",
    role: "customer",
    sender: { id: "customer-1", name: "客户" },
    sentAt: "2026-09-17 12:00:00",
    seq,
    status: "sent",
    uiMessageKey: `message-${seq}`,
  };
}

function createResponse(
  direction: "provide_response" | "request_information" | "handle_request",
): CustomerResponsePreflightResponse {
  return {
    assessment: {
      direction,
      reasoningSummary: "客户需要补充信息",
      outcome: "response_needed",
    },
    conversationId: "144",
    evaluatedThroughMessageId: "7003",
    nextAction: "confirm",
    source: "model",
  };
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}
