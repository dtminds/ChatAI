export type NewMessageSoundId = "msg_sound1" | "msg_sound2";
export type NewMessageSoundTrigger = "all_new_messages" | "unfocused_only";

export type NewMessageSoundPreference = {
  enabled: boolean;
  soundId: NewMessageSoundId;
  trigger: NewMessageSoundTrigger;
};

export type NewMessageSoundOption = {
  id: NewMessageSoundId;
  label: string;
  url: string;
};

export type NewMessageSoundTriggerOption = {
  label: string;
  value: NewMessageSoundTrigger;
};

export const NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY =
  "chat-ai-new-message-sound";

export const NEW_MESSAGE_SOUND_OPTIONS: NewMessageSoundOption[] = [
  {
    id: "msg_sound1",
    label: "提示音 1",
    url: "https://b5.bokr.com.cn/dist/sound/msg_sound1.mp3",
  },
  {
    id: "msg_sound2",
    label: "提示音 2",
    url: "https://b5.bokr.com.cn/dist/sound/msg_sound2.mp3",
  },
];

export const NEW_MESSAGE_SOUND_TRIGGER_OPTIONS: NewMessageSoundTriggerOption[] = [
  {
    label: "页面未聚焦时",
    value: "unfocused_only",
  },
  {
    label: "收到新消息时",
    value: "all_new_messages",
  },
];

const DEFAULT_PREFERENCE: NewMessageSoundPreference = {
  enabled: false,
  soundId: "msg_sound1",
  trigger: "unfocused_only",
};

const SOUND_THROTTLE_MS = 3000;
const SOUND_VOLUME = 0.55;

let audioElement: HTMLAudioElement | undefined;
let audioSoundId: NewMessageSoundId | undefined;
let unlockedSoundId: NewMessageSoundId | undefined;
let lastPlayedAt = Number.NEGATIVE_INFINITY;

export function getNewMessageSoundPreference(): NewMessageSoundPreference {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCE;
  }

  try {
    return normalizePreference(
      window.localStorage.getItem(NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function writeNewMessageSoundPreference(
  preference: NewMessageSoundPreference,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify(normalizePreferenceObject(preference)),
    );
  } catch {
    // The sound preference is best-effort local UI state.
  }
}

export function getNewMessageSoundOption(soundId: NewMessageSoundId) {
  return (
    NEW_MESSAGE_SOUND_OPTIONS.find((option) => option.id === soundId) ??
    NEW_MESSAGE_SOUND_OPTIONS[0]
  );
}

export function getNewMessageSoundTriggerOption(trigger: NewMessageSoundTrigger) {
  return (
    NEW_MESSAGE_SOUND_TRIGGER_OPTIONS.find((option) => option.value === trigger) ??
    NEW_MESSAGE_SOUND_TRIGGER_OPTIONS[0]
  );
}

export function isNewMessageSoundUnlocked(
  soundId = getNewMessageSoundPreference().soundId,
) {
  return unlockedSoundId === soundId;
}

export async function unlockNewMessageSound(
  soundId = getNewMessageSoundPreference().soundId,
) {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return false;
  }

  const audio = getAudioElement(soundId);

  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    unlockedSoundId = soundId;
    return true;
  } catch {
    if (unlockedSoundId === soundId) {
      unlockedSoundId = undefined;
    }
    return false;
  }
}

export async function playNewMessageSoundPreview(soundId: NewMessageSoundId) {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return false;
  }

  const audio = getAudioElement(soundId);
  audio.currentTime = 0;

  try {
    await audio.play();
    unlockedSoundId = soundId;
    return true;
  } catch {
    if (unlockedSoundId === soundId) {
      unlockedSoundId = undefined;
    }
    return false;
  }
}

export function notifyNewMessageSound() {
  const preference = getNewMessageSoundPreference();

  if (!preference.enabled || !isNewMessageSoundUnlocked(preference.soundId)) {
    return;
  }

  if (preference.trigger === "unfocused_only" && isCurrentTabActive()) {
    return;
  }

  const now = Date.now();
  if (now - lastPlayedAt < SOUND_THROTTLE_MS) {
    return;
  }

  const audio = getAudioElement(preference.soundId);
  lastPlayedAt = now;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    if (unlockedSoundId === preference.soundId) {
      unlockedSoundId = undefined;
    }
  });
}

export function clearNewMessageSoundRuntimeState() {
  audioElement?.pause();
  audioElement = undefined;
  audioSoundId = undefined;
  unlockedSoundId = undefined;
  lastPlayedAt = Number.NEGATIVE_INFINITY;
}

function getAudioElement(soundId: NewMessageSoundId) {
  if (!audioElement || audioSoundId !== soundId) {
    audioElement?.pause();
    audioElement = new Audio(getNewMessageSoundOption(soundId).url);
    audioElement.preload = "auto";
    audioElement.volume = SOUND_VOLUME;
    audioSoundId = soundId;
  }

  return audioElement;
}

function normalizePreference(value: string | null): NewMessageSoundPreference {
  if (!value) {
    return DEFAULT_PREFERENCE;
  }

  try {
    return normalizePreferenceObject(JSON.parse(value));
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function normalizePreferenceObject(value: unknown): NewMessageSoundPreference {
  if (!value || typeof value !== "object") {
    return DEFAULT_PREFERENCE;
  }

  const candidate = value as Partial<NewMessageSoundPreference>;

  return {
    enabled: candidate.enabled === true,
    soundId: isNewMessageSoundId(candidate.soundId)
      ? candidate.soundId
      : DEFAULT_PREFERENCE.soundId,
    trigger: isNewMessageSoundTrigger(candidate.trigger)
      ? candidate.trigger
      : DEFAULT_PREFERENCE.trigger,
  };
}

function isNewMessageSoundId(value: unknown): value is NewMessageSoundId {
  return NEW_MESSAGE_SOUND_OPTIONS.some((option) => option.id === value);
}

function isNewMessageSoundTrigger(
  value: unknown,
): value is NewMessageSoundTrigger {
  return NEW_MESSAGE_SOUND_TRIGGER_OPTIONS.some((option) => option.value === value);
}

function isCurrentTabActive() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.visibilityState === "visible" && document.hasFocus();
}
