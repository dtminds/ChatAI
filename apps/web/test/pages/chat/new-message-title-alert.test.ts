import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyPulledCustomerMessage,
  resetWorkbenchTitleAlert,
  WORKBENCH_DEFAULT_TITLE,
  WORKBENCH_EMPTY_MESSAGE_TITLE,
  WORKBENCH_NEW_MESSAGE_TITLE,
} from "@/pages/chat/lib/new-message-title-alert";
import {
  clearNewMessageSoundRuntimeState,
  unlockNewMessageSound,
  writeNewMessageSoundPreference,
} from "@/pages/chat/lib/new-message-sound-alert";

let audioInstances: AudioMock[];

describe("new message title alert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    audioInstances = [];
    clearNewMessageSoundRuntimeState();
    window.localStorage.clear();
    vi.stubGlobal("Audio", AudioMock);
    setDocumentVisibility("visible");
    setDocumentFocus(true);
    document.title = WORKBENCH_DEFAULT_TITLE;
  });

  afterEach(() => {
    resetWorkbenchTitleAlert();
    clearNewMessageSoundRuntimeState();
    vi.unstubAllGlobals();
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

  it("plays the configured sound for new messages when the trigger allows focused tabs", async () => {
    writeNewMessageSoundPreference({
      enabled: true,
      soundId: "msg_sound1",
      trigger: "all_new_messages",
    });
    await unlockNewMessageSound();

    notifyPulledCustomerMessage();

    expect(document.title).toBe(WORKBENCH_DEFAULT_TITLE);
    expect(audioInstances[0].play).toHaveBeenCalledTimes(2);
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

class AudioMock {
  currentTime = 0;
  preload = "";
  src: string;
  volume = 1;
  pause = vi.fn();
  play = vi.fn(() => Promise.resolve());

  constructor(src: string) {
    this.src = src;
    audioInstances.push(this);
  }
}
