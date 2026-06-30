import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNewMessageSoundRuntimeState,
  getNewMessageSoundPreference,
  isNewMessageSoundUnlocked,
  NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
  notifyNewMessageSound,
  playNewMessageSoundPreview,
  unlockNewMessageSound,
  writeNewMessageSoundPreference,
} from "@/pages/chat/lib/new-message-sound-alert";

let audioInstances: AudioMock[];

describe("new message sound alert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    audioInstances = [];
    window.localStorage.clear();
    setDocumentVisibility("visible");
    setDocumentFocus(true);
    vi.stubGlobal("Audio", AudioMock);
  });

  afterEach(() => {
    clearNewMessageSoundRuntimeState();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setDocumentVisibility("visible");
    setDocumentFocus(true);
  });

  it("persists a global localStorage preference with default sound and trigger labels", () => {
    expect(getNewMessageSoundPreference()).toMatchObject({
      enabled: false,
      soundId: "msg_sound1",
      trigger: "unfocused_only",
    });

    writeNewMessageSoundPreference({
      enabled: true,
      soundId: "msg_sound2",
      trigger: "all_new_messages",
    });

    expect(window.localStorage.getItem(NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY)).toContain(
      "msg_sound2",
    );
    expect(getNewMessageSoundPreference()).toMatchObject({
      enabled: true,
      soundId: "msg_sound2",
      trigger: "all_new_messages",
    });
  });

  it("unlocks the saved sound from a user gesture and plays only when the trigger allows it", async () => {
    writeNewMessageSoundPreference({
      enabled: true,
      soundId: "msg_sound2",
      trigger: "unfocused_only",
    });

    await expect(unlockNewMessageSound()).resolves.toBe(true);

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].src).toBe("https://b5.bokr.com.cn/dist/sound/msg_sound2.mp3");
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1);
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1);

    notifyNewMessageSound();

    expect(audioInstances[0].play).toHaveBeenCalledTimes(1);

    setDocumentVisibility("hidden");
    setDocumentFocus(false);
    notifyNewMessageSound();

    expect(audioInstances[0].play).toHaveBeenCalledTimes(2);

    notifyNewMessageSound();

    expect(audioInstances[0].play).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(3000);
    notifyNewMessageSound();

    expect(audioInstances[0].play).toHaveBeenCalledTimes(3);
  });

  it("plays for every customer message trigger when configured to do so", async () => {
    writeNewMessageSoundPreference({
      enabled: true,
      soundId: "msg_sound1",
      trigger: "all_new_messages",
    });

    await unlockNewMessageSound();
    notifyNewMessageSound();

    expect(audioInstances[0].play).toHaveBeenCalledTimes(2);
  });

  it("does not treat a different previewed sound as the saved sound permission", async () => {
    writeNewMessageSoundPreference({
      enabled: true,
      soundId: "msg_sound1",
      trigger: "all_new_messages",
    });

    await unlockNewMessageSound("msg_sound2");

    expect(isNewMessageSoundUnlocked("msg_sound2")).toBe(true);
    expect(isNewMessageSoundUnlocked("msg_sound1")).toBe(false);

    notifyNewMessageSound();

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].src).toBe("https://b5.bokr.com.cn/dist/sound/msg_sound2.mp3");
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1);
  });

  it("plays a preview without immediately pausing it", async () => {
    await playNewMessageSoundPreview("msg_sound2");

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].src).toBe("https://b5.bokr.com.cn/dist/sound/msg_sound2.mp3");
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1);
    expect(audioInstances[0].pause).not.toHaveBeenCalled();
    expect(isNewMessageSoundUnlocked("msg_sound2")).toBe(true);
  });

  it("pauses the existing audio before switching to another sound", async () => {
    await playNewMessageSoundPreview("msg_sound1");

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].pause).not.toHaveBeenCalled();

    await playNewMessageSoundPreview("msg_sound2");

    expect(audioInstances).toHaveLength(2);
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1);
    expect(audioInstances[1].src).toBe("https://b5.bokr.com.cn/dist/sound/msg_sound2.mp3");
  });

  it("does not throw in non-document environments", async () => {
    writeNewMessageSoundPreference({
      enabled: true,
      soundId: "msg_sound1",
      trigger: "unfocused_only",
    });
    await unlockNewMessageSound("msg_sound1");
    vi.stubGlobal("document", undefined);

    expect(() => notifyNewMessageSound()).not.toThrow();
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
