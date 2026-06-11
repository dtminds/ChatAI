import {
  PauseIcon,
  PlayIcon,
  SpeechIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { VoiceMessageContent } from "@/pages/chat/chat-types";
import { resolveVoiceTranscriptionErrorMessage } from "@/pages/chat/lib/voice-transcription-error";

type VoiceMessageCardProps = {
  content: VoiceMessageContent;
  isAgent: boolean;
  onPlaybackReady?: (payload: { playbackUrl: string }) => void;
  onTranscribe?: () => Promise<string>;
};

type ActiveVoicePlayback = {
  id: symbol;
  stop: () => void;
};

type AudioListenerHandlers = {
  error: () => void;
  ended: () => void;
  loadedmetadata: () => void;
  pause: () => void;
  timeupdate: () => void;
};

type PlaybackState =
  | "idle"
  | "preparing"
  | "playing"
  | "paused"
  | "error"
  | "not-ready";

type TranscriptionState = "idle" | "loading" | "error";

// Covers slow COS/CDN availability and weak-network metadata loading before showing retry.
const MEDIA_LOAD_TIMEOUT_MS = 8000;
const HAVE_METADATA_READY_STATE = 1;

let activeVoicePlayback: ActiveVoicePlayback | null = null;
let playbackGeneration = 0;

export function VoiceMessageCard({
  content,
  isAgent,
  onPlaybackReady,
  onTranscribe,
}: VoiceMessageCardProps) {
  const bubbleTone = isAgent ? "bg-primary/10" : "bg-secondary";
  const playbackIdRef = useRef(Symbol("voice-message-playback"));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioOriginalUrlRef = useRef<string | null>(null);
  const isReleasingAudioRef = useRef(false);
  const loadTimeoutRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);
  const playbackReadyNotifiedUrlRef = useRef<string | undefined>(undefined);
  const audioPlaybackUrlRef = useRef<string | null>(null);
  const previousAudioUrlRef = useRef(content.audioUrl);
  const previousSyncedTransVoiceTextRef = useRef(content.transVoiceText?.trim() ?? "");
  const transcriptionRequestIdRef = useRef(0);
  const latestTranscriptionSourceRef = useRef({
    audioUrl: content.audioUrl,
    transVoiceText: content.transVoiceText?.trim() ?? "",
  });
  const audioListenerHandlersRef = useRef<AudioListenerHandlers>({
    error: () => undefined,
    ended: () => undefined,
    loadedmetadata: () => undefined,
    pause: () => undefined,
    timeupdate: () => undefined,
  });
  const audioListenersRef = useRef<AudioListenerHandlers>({
    error: () => audioListenerHandlersRef.current.error(),
    ended: () => audioListenerHandlersRef.current.ended(),
    loadedmetadata: () => audioListenerHandlersRef.current.loadedmetadata(),
    pause: () => audioListenerHandlersRef.current.pause(),
    timeupdate: () => audioListenerHandlersRef.current.timeupdate(),
  });
  const releaseAudioRef = useRef<() => void>(() => undefined);
  const stopPlaybackRef = useRef<() => void>(() => undefined);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcriptionState, setTranscriptionState] =
    useState<TranscriptionState>("idle");
  const [transcriptionErrorMessage, setTranscriptionErrorMessage] = useState<
    string | null
  >(null);
  const [localTransVoiceText, setLocalTransVoiceText] = useState("");
  const canPlay = Boolean(content.audioUrl);
  const label = content.durationLabel || "语音";
  const transVoiceText = content.transVoiceText?.trim() || localTransVoiceText;
  const fallbackDuration = parseDurationLabel(content.durationLabel);
  const displayDuration = duration > 0 ? duration : fallbackDuration;
  const durationLabel =
    displayDuration && displayDuration > 0
      ? formatVoiceDuration(displayDuration)
      : label;
  const sliderMax = Math.max(displayDuration ?? 0, currentTime, 1);
  const sliderValue = Math.min(currentTime, sliderMax);
  const progressPercent = sliderMax > 0 ? (sliderValue / sliderMax) * 100 : 0;
  const isPlaying = playbackState === "playing";
  const isActivePlayer =
    playbackState === "preparing" ||
    playbackState === "playing" ||
    playbackState === "paused";
  const isStatusVisible =
    playbackState === "preparing" ||
    playbackState === "error" ||
    playbackState === "not-ready";
  const statusLabel = getPlaybackStatusLabel(playbackState, label);
  const controlLabel = canPlay
    ? `${isPlaying ? "暂停" : "播放"}语音消息 ${label}`
    : "语音消息不可播放";
  const shouldShowTranscribeAction = Boolean(onTranscribe && !transVoiceText);
  const shouldShowTranscriptionPanel =
    transcriptionState === "loading" ||
    Boolean(transVoiceText) ||
    Boolean(transcriptionErrorMessage);
  const shouldShowTranscriptionLoading =
    !transVoiceText && transcriptionState === "loading";

  latestTranscriptionSourceRef.current = {
    audioUrl: content.audioUrl,
    transVoiceText: content.transVoiceText?.trim() ?? "",
  };

  const handleTranscribeClick = async () => {
    if (!onTranscribe || transcriptionState === "loading") {
      return;
    }

    const requestId = transcriptionRequestIdRef.current + 1;
    transcriptionRequestIdRef.current = requestId;
    const requestAudioUrl = content.audioUrl;
    setTranscriptionErrorMessage(null);
    setTranscriptionState("loading");

    try {
      const nextTransVoiceText = await onTranscribe();

      if (
        !mountedRef.current ||
        transcriptionRequestIdRef.current !== requestId ||
        latestTranscriptionSourceRef.current.audioUrl !== requestAudioUrl ||
        latestTranscriptionSourceRef.current.transVoiceText
      ) {
        return;
      }

      const normalizedTransVoiceText = String(nextTransVoiceText ?? "").trim();

      if (!normalizedTransVoiceText) {
        throw new Error("EMPTY_TRANSCRIPTION");
      }

      setLocalTransVoiceText(normalizedTransVoiceText);
      setTranscriptionErrorMessage(null);
      setTranscriptionState("idle");
    } catch (error) {
      if (
        !mountedRef.current ||
        transcriptionRequestIdRef.current !== requestId ||
        latestTranscriptionSourceRef.current.audioUrl !== requestAudioUrl ||
        latestTranscriptionSourceRef.current.transVoiceText
      ) {
        return;
      }

      setTranscriptionErrorMessage(resolveVoiceTranscriptionErrorMessage(error));
      setTranscriptionState("error");
    }
  };

  const clearActivePlayback = useCallback(() => {
    if (activeVoicePlayback?.id === playbackIdRef.current) {
      activeVoicePlayback = null;
    }
  }, []);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current === undefined) {
      return;
    }

    window.clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = undefined;
  }, []);

  const finishPlayback = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    clearLoadTimeout();
    clearActivePlayback();
    setCurrentTime(0);
    setPlaybackState("idle");
  }, [clearActivePlayback, clearLoadTimeout]);

  const failPlayback = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    clearLoadTimeout();
    releaseAudioRef.current();
    clearActivePlayback();
    setPlaybackState("error");
  }, [clearActivePlayback, clearLoadTimeout]);

  const rejectPlaybackAsNotReady = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    clearLoadTimeout();
    releaseAudioRef.current();
    clearActivePlayback();
    setCurrentTime(0);
    setPlaybackState("not-ready");
  }, [clearActivePlayback, clearLoadTimeout]);

  const syncAudioProgress = useCallback(() => {
    const audio = audioRef.current;

    if (!audio || !mountedRef.current) {
      return;
    }

    if (hasAudioMetadata(audio)) {
      clearLoadTimeout();
    }
    const nextDuration = getFiniteAudioTime(audio.duration);
    const nextCurrentTime = getFiniteAudioTime(audio.currentTime);

    if (nextDuration > 0) {
      setDuration(nextDuration);
    }
    setCurrentTime(nextCurrentTime);
  }, [clearLoadTimeout]);

  const confirmPlaybackReady = useCallback(() => {
    if (
      content.playbackUrl &&
      audioPlaybackUrlRef.current === content.playbackUrl &&
      !content.transFileUrlPersisted &&
      playbackReadyNotifiedUrlRef.current !== content.playbackUrl
    ) {
      playbackReadyNotifiedUrlRef.current = content.playbackUrl;
      onPlaybackReady?.({ playbackUrl: content.playbackUrl });
    }
  }, [
    content.playbackUrl,
    content.transFileUrlPersisted,
    onPlaybackReady,
  ]);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current || !mountedRef.current) {
      return;
    }

    syncAudioProgress();
    setPlaybackState("playing");
    confirmPlaybackReady();
  }, [confirmPlaybackReady, syncAudioProgress]);

  const failOrRejectPendingPlayback = useCallback(() => {
    const audio = audioRef.current;

    if (
      content.playbackUrl &&
      audioPlaybackUrlRef.current === content.playbackUrl &&
      !hasAudioMetadata(audio)
    ) {
      rejectPlaybackAsNotReady();
      return;
    }

    failPlayback();
  }, [content.playbackUrl, failPlayback, rejectPlaybackAsNotReady]);

  const finishPlaybackIfEnded = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const hasReachedEnd =
      Number.isFinite(audio.duration) &&
      audio.duration > 0 &&
      audio.currentTime >= audio.duration;

    if (audio.ended || hasReachedEnd) {
      finishPlayback();
    }
  }, [finishPlayback]);

  const pausePlayback = useCallback(() => {
    if (!mountedRef.current || isReleasingAudioRef.current) {
      return;
    }

    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (!hasAudioMetadata(audio)) {
      return;
    }

    const hasReachedEnd =
      Number.isFinite(audio.duration) &&
      audio.duration > 0 &&
      audio.currentTime >= audio.duration;

    if (audio.ended || hasReachedEnd) {
      finishPlayback();
      return;
    }

    syncAudioProgress();
    setPlaybackState("paused");
  }, [finishPlayback, syncAudioProgress]);

  const releaseAudio = useCallback(() => {
    clearLoadTimeout();

    if (!audioRef.current) {
      return;
    }

    const audio = audioRef.current;
    const listeners = audioListenersRef.current;

    audio.removeEventListener("pause", listeners.pause);
    audio.removeEventListener("loadedmetadata", listeners.loadedmetadata);
    audio.removeEventListener("timeupdate", listeners.timeupdate);
    audio.removeEventListener("ended", listeners.ended);
    audio.removeEventListener("error", listeners.error);
    isReleasingAudioRef.current = true;
    audio.pause();
    audio.src = "";
    try {
      audio.load();
    } catch {}
    isReleasingAudioRef.current = false;
    audioRef.current = null;
    audioOriginalUrlRef.current = null;
    audioPlaybackUrlRef.current = null;
  }, [
    clearLoadTimeout,
  ]);

  releaseAudioRef.current = releaseAudio;
  audioListenerHandlersRef.current = {
    error: failOrRejectPendingPlayback,
    ended: finishPlayback,
    loadedmetadata: handleLoadedMetadata,
    pause: pausePlayback,
    timeupdate: syncAudioProgress,
  };

  const stopPlayback = useCallback(() => {
    releaseAudio();
    clearActivePlayback();

    if (mountedRef.current) {
      setCurrentTime(0);
      setPlaybackState("idle");
    }
  }, [clearActivePlayback, releaseAudio]);

  stopPlaybackRef.current = stopPlayback;

  const claimActivePlayback = useCallback(() => {
    if (activeVoicePlayback?.id !== playbackIdRef.current) {
      activeVoicePlayback?.stop();
    }

    playbackGeneration += 1;
    activeVoicePlayback = {
      id: playbackIdRef.current,
      stop: stopPlayback,
    };

    return playbackGeneration;
  }, [stopPlayback]);

  const isCurrentPlayback = useCallback((generation: number) => (
    activeVoicePlayback?.id === playbackIdRef.current &&
    playbackGeneration === generation
  ), []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopPlaybackRef.current();
    };
  }, []);

  useEffect(() => {
    if (previousAudioUrlRef.current === content.audioUrl) {
      return;
    }

    previousAudioUrlRef.current = content.audioUrl;
    transcriptionRequestIdRef.current += 1;
    setLocalTransVoiceText("");
    setTranscriptionErrorMessage(null);
    setTranscriptionState("idle");
    playbackReadyNotifiedUrlRef.current = undefined;
    stopPlaybackRef.current();
    setDuration(0);
  }, [content.audioUrl]);

  useEffect(() => {
    const syncedTransVoiceText = content.transVoiceText?.trim() ?? "";

    if (previousSyncedTransVoiceTextRef.current === syncedTransVoiceText) {
      return;
    }

    previousSyncedTransVoiceTextRef.current = syncedTransVoiceText;

    if (!syncedTransVoiceText) {
      return;
    }

    transcriptionRequestIdRef.current += 1;
    setLocalTransVoiceText("");
    setTranscriptionErrorMessage(null);
    setTranscriptionState("idle");
  }, [content.transVoiceText]);

  const handleControlClick = async () => {
    if (!content.audioUrl) {
      return;
    }

    if (playbackState === "playing") {
      audioRef.current?.pause();
      pausePlayback();
      return;
    }

    let generation: number | undefined;

    try {
      generation = claimActivePlayback();

      if (
        playbackState === "paused" &&
        audioRef.current &&
        audioOriginalUrlRef.current === content.audioUrl
      ) {
        setPlaybackState("playing");
        await audioRef.current.play();
        finishPlaybackIfEnded();
        return;
      }

      setPlaybackState("preparing");
      const immediateAudioUrl = getImmediateAudioUrl(content);

      if (immediateAudioUrl) {
        await playNativeAudio(
          immediateAudioUrl,
          content.audioUrl,
          generation,
        );
        return;
      }
      rejectPlaybackAsNotReady();
    } catch {
      if (generation == null || isCurrentPlayback(generation)) {
        failPlayback();
      }
    }
  };

  const handleSeekChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);

    if (!Number.isFinite(nextTime)) {
      return;
    }

    const seekMax = Math.max(
      getFiniteAudioTime(audioRef.current?.duration ?? 0),
      displayDuration ?? 0,
      currentTime,
      1,
    );
    const clampedTime = Math.max(0, Math.min(nextTime, seekMax));

    const audio = audioRef.current;

    if (audio && audio.readyState >= HAVE_METADATA_READY_STATE) {
      audio.currentTime = clampedTime;
    }

    setCurrentTime(clampedTime);
  };

  const playNativeAudio = async (
    audioUrl: string,
    originalUrl: string,
    generation: number,
  ) => {
    clearLoadTimeout();

    if (!audioRef.current || audioRef.current.src !== audioUrl) {
      releaseAudio();
      audioRef.current = new Audio(audioUrl);
      audioRef.current.preload = "auto";
      audioOriginalUrlRef.current = originalUrl;
      audioPlaybackUrlRef.current = audioUrl;
      audioRef.current.addEventListener(
        "loadedmetadata",
        audioListenersRef.current.loadedmetadata,
      );
      audioRef.current.addEventListener("timeupdate", audioListenersRef.current.timeupdate);
      audioRef.current.addEventListener("ended", audioListenersRef.current.ended);
      audioRef.current.addEventListener("error", audioListenersRef.current.error);
      audioRef.current.addEventListener("pause", audioListenersRef.current.pause);
    }

    if (!mountedRef.current || !isCurrentPlayback(generation)) {
      return;
    }

    if (audioRef.current.readyState >= HAVE_METADATA_READY_STATE) {
      audioRef.current.currentTime = 0;
    }
    setCurrentTime(0);
    loadTimeoutRef.current = window.setTimeout(() => {
      const audio = audioRef.current;

      if (
        mountedRef.current &&
        isCurrentPlayback(generation) &&
        (!audio || audio.readyState < HAVE_METADATA_READY_STATE)
      ) {
        failOrRejectPendingPlayback();
      }
    }, MEDIA_LOAD_TIMEOUT_MS);
    audioRef.current.load();
    const playPromise = audioRef.current.play();
    await playPromise;
    if (
      mountedRef.current &&
      isCurrentPlayback(generation) &&
      hasAudioMetadata(audioRef.current)
    ) {
      handleLoadedMetadata();
    }
    finishPlaybackIfEnded();
  };

  const voiceControl = !isActivePlayer ? (
      <button
        aria-label={controlLabel}
        className={cn(
          "relative inline-flex min-h-10 min-w-28 items-center gap-2.5 rounded-[12px] px-3.5 py-1.5 outline-none transition-[filter] focus-visible:ring-4 focus-visible:ring-ring/25",
          canPlay ? "cursor-pointer hover:brightness-[0.98]" : "cursor-not-allowed opacity-70",
          bubbleTone,
        )}
        disabled={!canPlay}
        onClick={handleControlClick}
        type="button"
      >
        <HugeiconsIcon
          className="relative z-1 shrink-0 text-foreground"
          data-testid="voice-volume-icon"
          data-volume-icon="high"
          icon={SpeechIcon}
          size={18}
          strokeWidth={1.9}
        />
        <span className="relative z-1 shrink-0 text-[14px] leading-none text-foreground">
          {statusLabel}
        </span>
      </button>
    ) : (
    <div
      className={cn(
        "relative inline-flex min-h-10 w-[216px] max-w-full items-center gap-2.5 rounded-[12px] px-3 py-2",
        !canPlay && "opacity-70",
        bubbleTone,
      )}
    >
      <button
        aria-label={controlLabel}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-4 focus-visible:ring-ring/25",
          !canPlay || playbackState === "preparing"
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer",
        )}
        disabled={!canPlay || playbackState === "preparing"}
        onClick={handleControlClick}
        type="button"
      >
        {playbackState === "preparing" ? (
          <Spinner variant="classic" size={17} className="text-current" />
        ) : (
          <HugeiconsIcon
            data-playback-icon={isPlaying ? "pause" : "play"}
            data-testid="voice-playback-icon"
            icon={isPlaying ? PauseIcon : PlayIcon}
            size={17}
            strokeWidth={2}
          />
        )}
        <span className="sr-only">{statusLabel}</span>
      </button>

      {isStatusVisible ? (
        <span className="min-w-0 flex-1 truncate text-[14px] leading-none text-foreground">
          {statusLabel}
        </span>
      ) : (
        <>
          <div className="relative h-5 min-w-0 flex-1">
            <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-foreground/15">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span
              className="pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_2px_var(--background)]"
              style={{ left: `${progressPercent}%` }}
            />
            <input
              aria-label="语音播放进度"
              className="absolute inset-0 h-5 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              disabled={!canPlay}
              max={sliderMax}
              min={0}
              onChange={handleSeekChange}
              step={0.1}
              type="range"
              value={sliderValue}
            />
          </div>
          <span className="shrink-0 text-[13px] leading-none text-muted-foreground tabular-nums">
            {durationLabel}
          </span>
        </>
      )}
    </div>
  );

  const transcribeAction = shouldShowTranscribeAction && transcriptionState !== "loading" ? (
    <button
      className="inline-flex h-8 shrink-0 items-center rounded-[6px] px-1.5 text-[12px] font-medium leading-none text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-70"
      onClick={handleTranscribeClick}
      type="button"
    >
      转文字
    </button>
  ) : null;

  return (
    <div className={cn("inline-flex max-w-full flex-col gap-1.5", isAgent ? "items-end" : "items-start")}>
      <div
        className={cn(
          "inline-flex max-w-full items-center gap-2",
          isAgent && "flex-row-reverse",
        )}
      >
        {voiceControl}
        {transcribeAction}
      </div>
      {shouldShowTranscriptionPanel ? (
        <div
          aria-label={shouldShowTranscriptionLoading ? "语音转文字中" : undefined}
          className={cn(
            "min-h-9 max-w-[min(480px,100%)] whitespace-pre-wrap break-words rounded-[10px] bg-surface-muted px-3 py-2 text-[13px] leading-5 text-foreground",
            shouldShowTranscriptionLoading && "inline-flex min-w-16 items-center justify-center",
            !transVoiceText && transcriptionState === "error" && "text-destructive",
          )}
          role={shouldShowTranscriptionLoading ? "status" : undefined}
        >
          {transVoiceText ? (
            transVoiceText
          ) : shouldShowTranscriptionLoading ? (
            <Spinner variant="classic" size={16} className="text-muted-foreground" />
          ) : (
            transcriptionErrorMessage
          )}
        </div>
      ) : null}
    </div>
  );
}

function isUnplayableNativeUrl(url: string) {
  return /\.(?:amr|silk)(?:[?#].*)?$/i.test(url);
}

function getImmediateAudioUrl(content: VoiceMessageContent) {
  if (content.playbackUrl) {
    return content.playbackUrl;
  }

  if (!content.audioUrl || isUnplayableNativeUrl(content.audioUrl)) {
    return undefined;
  }

  return content.audioUrl;
}

function hasAudioMetadata(audio: HTMLAudioElement | null) {
  return Boolean(
    audio &&
      audio.readyState >= HAVE_METADATA_READY_STATE &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0,
  );
}

function getFiniteAudioTime(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getPlaybackStatusLabel(playbackState: PlaybackState, label: string) {
  if (playbackState === "error") {
    return "暂不可播放";
  }
  if (playbackState === "not-ready") {
    return "暂不支持播放，请稍后重试";
  }
  if (playbackState === "preparing") {
    return "准备播放";
  }
  if (playbackState === "playing") {
    return "播放中";
  }

  return label;
}

function parseDurationLabel(label?: string) {
  if (!label) {
    return undefined;
  }

  const normalizedLabel = label.trim();
  const minuteMatch = /^(\d+)'(\d{1,2})"?$/.exec(normalizedLabel);

  if (minuteMatch) {
    return Number(minuteMatch[1]) * 60 + Number(minuteMatch[2]);
  }

  const secondMatch = /^(\d+(?:\.\d+)?)"?$/.exec(normalizedLabel);

  if (secondMatch) {
    return Number(secondMatch[1]);
  }

  return undefined;
}

function formatVoiceDuration(seconds: number) {
  const roundedSeconds = Math.max(0, Math.round(seconds));

  if (roundedSeconds < 60) {
    return `${roundedSeconds}"`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = String(roundedSeconds % 60).padStart(2, "0");

  return `${minutes}'${remainingSeconds}"`;
}
