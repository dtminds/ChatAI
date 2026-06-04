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

  it("does not flash when the current tab is visible and focused", () => {
    notifyPulledCustomerMessage();

    expect(document.title).toBe(WORKBENCH_DEFAULT_TITLE);

    vi.advanceTimersByTime(2000);
    expect(document.title).toBe(WORKBENCH_DEFAULT_TITLE);
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
