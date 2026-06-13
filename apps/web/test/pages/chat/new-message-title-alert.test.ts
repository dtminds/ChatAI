import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyPulledCustomerMessage,
  resetWorkbenchTitleAlert,
  WORKBENCH_DEFAULT_TITLE,
  WORKBENCH_EMPTY_MESSAGE_TITLE,
  WORKBENCH_NEW_MESSAGE_TITLE,
} from "@/pages/chat/lib/new-message-title-alert";

describe("new message title alert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocumentVisibility("visible");
    setDocumentFocus(true);
    document.title = WORKBENCH_DEFAULT_TITLE;
  });

  afterEach(() => {
    resetWorkbenchTitleAlert();
    vi.useRealTimers();
    setDocumentVisibility("visible");
    setDocumentFocus(true);
    document.title = WORKBENCH_DEFAULT_TITLE;
  });

  it("uses the branded workbench title in every alert state", () => {
    expect(WORKBENCH_DEFAULT_TITLE).toBe("ChatAI 客服工作台");
    expect(WORKBENCH_NEW_MESSAGE_TITLE).toBe("【新消息】ChatAI 客服工作台");
    expect(WORKBENCH_EMPTY_MESSAGE_TITLE).toBe("【　　　】ChatAI 客服工作台");
  });

  it("flashes between the new-message title and default title while the tab is inactive", () => {
    setDocumentVisibility("hidden");
    setDocumentFocus(false);

    notifyPulledCustomerMessage();

    expect(document.title).toBe(WORKBENCH_NEW_MESSAGE_TITLE);

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe(WORKBENCH_EMPTY_MESSAGE_TITLE);

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe(WORKBENCH_NEW_MESSAGE_TITLE);

    setDocumentVisibility("visible");
    setDocumentFocus(true);
    window.dispatchEvent(new Event("focus"));

    expect(document.title).toBe(WORKBENCH_DEFAULT_TITLE);

    vi.advanceTimersByTime(2000);
    expect(document.title).toBe(WORKBENCH_DEFAULT_TITLE);
  });

  it("refreshes the flash cycle when another message arrives while alerting", () => {
    setDocumentVisibility("hidden");
    setDocumentFocus(false);

    notifyPulledCustomerMessage();

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe(WORKBENCH_EMPTY_MESSAGE_TITLE);

    notifyPulledCustomerMessage();

    expect(document.title).toBe(WORKBENCH_NEW_MESSAGE_TITLE);

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe(WORKBENCH_EMPTY_MESSAGE_TITLE);

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe(WORKBENCH_NEW_MESSAGE_TITLE);
  });

  it("does not flash when the current tab is visible and focused", () => {
    notifyPulledCustomerMessage();

    expect(document.title).toBe(WORKBENCH_DEFAULT_TITLE);

    vi.advanceTimersByTime(2000);
    expect(document.title).toBe(WORKBENCH_DEFAULT_TITLE);
  });

  it("does not overwrite an external title when no alert is active", () => {
    document.title = "其他页面";

    resetWorkbenchTitleAlert();

    expect(document.title).toBe("其他页面");
  });

  it("unbinds reset listeners after the alert is cleared", () => {
    setDocumentVisibility("hidden");
    setDocumentFocus(false);

    notifyPulledCustomerMessage();
    expect(document.title).toBe(WORKBENCH_NEW_MESSAGE_TITLE);

    resetWorkbenchTitleAlert();
    document.title = "其他页面";
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(document.title).toBe("其他页面");
  });
});

function setDocumentVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

function setDocumentFocus(value: boolean) {
  Object.defineProperty(document, "hasFocus", {
    configurable: true,
    value: vi.fn(() => value),
  });
}
