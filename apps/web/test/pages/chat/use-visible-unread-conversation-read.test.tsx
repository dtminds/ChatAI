import { useRef, useState, type RefObject } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/pages/chat/chat-types";
import { useVisibleUnreadConversationRead } from "@/pages/chat/hooks/use-visible-unread-conversation-read";
import { getMessageFeedItemKey } from "@/pages/chat/lib/message-feed-key";

type IntersectionObserverEntryInit = {
  isIntersecting: boolean;
  target: Element;
};

type IntersectionObserverInstance = {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  options?: IntersectionObserverInit;
  unobserve: ReturnType<typeof vi.fn>;
};

function installIntersectionObserverMock() {
  const instances: IntersectionObserverInstance[] = [];

  class IntersectionObserverMock {
    readonly callback: IntersectionObserverCallback;
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();
    readonly options: IntersectionObserverInit | undefined;
    readonly unobserve = vi.fn();

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.callback = callback;
      this.options = options;
      instances.push(this);
    }
  }

  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: IntersectionObserverMock,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: IntersectionObserverMock,
  });

  return {
    emit(entries: IntersectionObserverEntryInit[]) {
      for (const instance of instances) {
        instance.callback(
          entries as IntersectionObserverEntry[],
          instance as unknown as IntersectionObserver,
        );
      }
    },
    instances,
  };
}

function getObserveCallCount(instances: IntersectionObserverInstance[]) {
  return instances.reduce(
    (count, instance) => count + instance.observe.mock.calls.length,
    0,
  );
}

function createCustomerMessage(uiMessageKey: string): Message {
  return {
    author: "客户",
    content: {
      text: "新消息",
      type: "text",
    },
    conversationId: "conv-001",
    role: "customer",
    sender: {
      id: "sender-cust-001",
      name: "客户",
    },
    sentAt: "2026-04-14 19:18:50",
    status: "sent",
    uiMessageKey,
  };
}

type HarnessProps = {
  canUseConversationActions?: boolean;
  firstUnreadMessageKey?: string;
  isConversationLoading?: boolean;
  markConversationRead: (conversationId: string) => Promise<void>;
  messages: Message[];
  shouldSuppressAutoRead?: (
    conversationId: string,
    unreadCount: number,
  ) => boolean;
  unreadCount: number;
};

function UnreadReadHarness({
  canUseConversationActions = true,
  firstUnreadMessageKey,
  isConversationLoading = false,
  markConversationRead,
  messages,
  shouldSuppressAutoRead,
  unreadCount,
}: HarnessProps) {
  const messageViewportRef = useRef<HTMLDivElement>(null);

  useVisibleUnreadConversationRead({
    activeConversationId: "conv-001",
    activeMessages: messages,
    activeView: "chat",
    canUseConversationActions,
    firstUnreadMessageKey,
    isConversationLoading,
    markConversationRead,
    messageViewportRef: messageViewportRef as RefObject<HTMLDivElement | null>,
    shouldSuppressAutoRead,
    unreadCount,
  });

  return (
    <div data-testid="message-viewport" ref={messageViewportRef}>
      {messages.map((message) =>
        message ? (
          <div
            data-ui-message-key={message.uiMessageKey}
            key={getMessageFeedItemKey(message)}
          >
            {message.uiMessageKey}
          </div>
        ) : null,
      )}
    </div>
  );
}

function RemountUnreadReadHarness({
  markConversationRead,
}: {
  markConversationRead: (conversationId: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([
    createCustomerMessage("7"),
    createCustomerMessage("8"),
  ]);

  return (
    <>
      <UnreadReadHarness
        firstUnreadMessageKey="8"
        markConversationRead={markConversationRead}
        messages={messages}
        unreadCount={2}
      />
      <button
        onClick={() => {
          setMessages((current) =>
            current.map((message) =>
              message.uiMessageKey === "8"
                ? { ...message, optNo: "opt-remounted-msg-009" }
                : message,
            ),
          );
        }}
        type="button"
      >
        remount
      </button>
    </>
  );
}

describe("useVisibleUnreadConversationRead", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("marks the active conversation read when the first unread message enters the viewport", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const markConversationRead = vi.fn().mockResolvedValue(undefined);

    render(
      <UnreadReadHarness
        firstUnreadMessageKey="8"
        markConversationRead={markConversationRead}
        messages={[createCustomerMessage("7"), createCustomerMessage("8")]}
        unreadCount={2}
      />,
    );

    await waitFor(() => {
      expect(intersectionObserver.instances.at(-1)?.observe).toHaveBeenCalled();
    });

    const observedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;

    expect(observedTarget).toHaveAttribute("data-ui-message-key", "8");
    expect(intersectionObserver.instances.at(-1)?.options).toMatchObject({
      threshold: 0,
    });

    act(() => {
      intersectionObserver.emit([
        {
          isIntersecting: true,
          target: observedTarget,
        },
      ]);
    });

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledTimes(1);
    });
    expect(markConversationRead).toHaveBeenCalledWith("conv-001");
  });

  it("observes the provided first unread message key", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const markConversationRead = vi.fn().mockResolvedValue(undefined);

    render(
      <UnreadReadHarness
        firstUnreadMessageKey="unread-customer"
        markConversationRead={markConversationRead}
        messages={[
          createCustomerMessage("read-customer"),
          createCustomerMessage("unread-agent-placeholder"),
          createCustomerMessage("unread-customer"),
        ]}
        unreadCount={2}
      />,
    );

    await waitFor(() => {
      expect(intersectionObserver.instances.at(-1)?.observe).toHaveBeenCalled();
    });

    const observedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;

    expect(observedTarget).toHaveAttribute("data-ui-message-key", "unread-customer");
  });

  it("waits until conversation loading finishes before observing unread messages", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const markConversationRead = vi.fn().mockResolvedValue(undefined);
    const messages = [createCustomerMessage("7"), createCustomerMessage("8")];

    const { rerender } = render(
      <UnreadReadHarness
        firstUnreadMessageKey="8"
        isConversationLoading
        markConversationRead={markConversationRead}
        messages={messages}
        unreadCount={2}
      />,
    );

    expect(getObserveCallCount(intersectionObserver.instances)).toBe(0);

    rerender(
      <UnreadReadHarness
        firstUnreadMessageKey="8"
        isConversationLoading={false}
        markConversationRead={markConversationRead}
        messages={messages}
        unreadCount={2}
      />,
    );

    await waitFor(() => {
      expect(getObserveCallCount(intersectionObserver.instances)).toBe(1);
    });
  });

  it("rebinds the unread observer when messages remount with the same first unread id", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const markConversationRead = vi.fn().mockResolvedValue(undefined);

    render(<RemountUnreadReadHarness markConversationRead={markConversationRead} />);

    await waitFor(() => {
      expect(getObserveCallCount(intersectionObserver.instances)).toBeGreaterThan(0);
    });

    const previousUnreadElement = document.querySelector(
      '[data-ui-message-key="8"]',
    );
    const observeCallCountBeforeMessageUpdate = getObserveCallCount(
      intersectionObserver.instances,
    );

    expect(previousUnreadElement).not.toBeNull();

    act(() => {
      screen.getByRole("button", { name: "remount" }).click();
    });

    await waitFor(() => {
      expect(getObserveCallCount(intersectionObserver.instances)).toBe(
        observeCallCountBeforeMessageUpdate + 1,
      );
    });

    const nextObservedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;
    const currentUnreadElement = document.querySelector('[data-ui-message-key="8"]');

    expect(currentUnreadElement).not.toBe(previousUnreadElement);
    expect(nextObservedTarget).toHaveAttribute("data-ui-message-key", "8");
    expect(nextObservedTarget).toBe(currentUnreadElement);
  });

  it("throttles visible unread read requests for the same active conversation", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const markConversationRead = vi.fn().mockResolvedValue(undefined);

    render(
      <UnreadReadHarness
        firstUnreadMessageKey="8"
        markConversationRead={markConversationRead}
        messages={[createCustomerMessage("7"), createCustomerMessage("8")]}
        unreadCount={2}
      />,
    );

    await waitFor(() => {
      expect(intersectionObserver.instances.at(-1)?.observe).toHaveBeenCalled();
    });

    const observedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;

    act(() => {
      intersectionObserver.emit([
        {
          isIntersecting: true,
          target: observedTarget,
        },
      ]);
    });

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledTimes(1);
    });

    act(() => {
      intersectionObserver.emit([
        {
          isIntersecting: true,
          target: observedTarget,
        },
      ]);
    });

    expect(markConversationRead).toHaveBeenCalledTimes(1);
  });

  it("does not mark read when auto-read is suppressed", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const markConversationRead = vi.fn().mockResolvedValue(undefined);

    render(
      <UnreadReadHarness
        firstUnreadMessageKey="8"
        markConversationRead={markConversationRead}
        messages={[createCustomerMessage("7"), createCustomerMessage("8")]}
        shouldSuppressAutoRead={() => true}
        unreadCount={2}
      />,
    );

    await waitFor(() => {
      expect(intersectionObserver.instances.at(-1)?.observe).toHaveBeenCalled();
    });

    const observedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;

    act(() => {
      intersectionObserver.emit([
        {
          isIntersecting: true,
          target: observedTarget,
        },
      ]);
    });

    expect(markConversationRead).not.toHaveBeenCalled();
  });

  it("does not auto mark the active conversation read when conversation actions are unavailable", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const markConversationRead = vi.fn().mockResolvedValue(undefined);

    render(
      <UnreadReadHarness
        canUseConversationActions={false}
        firstUnreadMessageKey="8"
        markConversationRead={markConversationRead}
        messages={[createCustomerMessage("7"), createCustomerMessage("8")]}
        unreadCount={2}
      />,
    );

    expect(intersectionObserver.instances).toHaveLength(0);
    expect(markConversationRead).not.toHaveBeenCalled();
  });
});
