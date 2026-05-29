const VOICE_PLAYBACK_CUE_BASE_URL = "https://b5.bokr.com.cn/dist";

const voicePlaybackCueUrls = {
  end: `${VOICE_PLAYBACK_CUE_BASE_URL}/notification-warning-crisp.wav`,
  failure: `${VOICE_PLAYBACK_CUE_BASE_URL}/notification-error-crisp.wav`,
  start: `${VOICE_PLAYBACK_CUE_BASE_URL}/notification-info-crisp.wav`,
} as const;

const cueAudioByUrl = new Map<string, HTMLAudioElement>();

export function playVoicePlaybackStartCue() {
  return playVoicePlaybackCue(voicePlaybackCueUrls.start);
}

export function playVoicePlaybackFailureCue() {
  return playVoicePlaybackCue(voicePlaybackCueUrls.failure);
}

export function playVoicePlaybackEndCue() {
  return playVoicePlaybackCue(voicePlaybackCueUrls.end);
}

async function playVoicePlaybackCue(url: string) {
  if (typeof Audio === "undefined") {
    return;
  }

  const audio = getCueAudio(url);
  audio.currentTime = 0;

  try {
    await audio.play();
  } catch {
    // Cue sounds are secondary feedback; failed cue playback should not affect voice playback.
  }
}

function getCueAudio(url: string) {
  const cachedAudio = cueAudioByUrl.get(url);

  if (cachedAudio) {
    return cachedAudio;
  }

  const audio = new Audio(url);
  audio.preload = "auto";
  cueAudioByUrl.set(url, audio);
  return audio;
}
