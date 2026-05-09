import { VolumeHighIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import BenzAMRRecorder from "benz-amr-recorder";
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "@/lib/request";
import { cn } from "@/lib/utils";
import type { VoiceMessageContent } from "@/pages/chat/chat-types";

type VoiceMessageCardProps = {
  content: VoiceMessageContent;
  isAgent: boolean;
};

type ActiveVoicePlayback = {
  id: symbol;
  stop: () => void;
};

type CleanupOptions = {
  destroyAmr?: boolean;
};

let activeVoicePlayback: ActiveVoicePlayback | null = null;
let playbackGeneration = 0;

export function VoiceMessageCard({
  content,
  isAgent,
}: VoiceMessageCardProps) {
  const bubbleTone = isAgent ? "bg-primary/10" : "bg-secondary";
  const playbackIdRef = useRef(Symbol("voice-message-playback"));
  const amrBlobRef = useRef<Blob | null>(null);
  const amrUrlRef = useRef<string | null>(null);
  const amrRef = useRef<BenzAMRRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackState, setPlaybackState] = useState<
    "idle" | "playing" | "error"
  >("idle");
  const canPlay = Boolean(content.audioUrl);
  const label = content.durationLabel || "语音";

  const clearActivePlayback = useCallback(() => {
    if (activeVoicePlayback?.id === playbackIdRef.current) {
      activeVoicePlayback = null;
    }
  }, []);

  const stopPlayback = useCallback((options: CleanupOptions = {}) => {
    audioRef.current?.pause();
    if (options.destroyAmr) {
      destroyAmrRecorder(amrRef.current);
      amrRef.current = null;
      amrBlobRef.current = null;
      amrUrlRef.current = null;
    } else {
      amrRef.current?.stop();
    }

    clearActivePlayback();
    setPlaybackState("idle");
  }, [clearActivePlayback]);

  const finishPlayback = useCallback(() => {
    clearActivePlayback();
    setPlaybackState("idle");
  }, [clearActivePlayback]);

  const failPlayback = useCallback(() => {
    clearActivePlayback();
    setPlaybackState("error");
  }, [clearActivePlayback]);

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
    return () => {
      stopPlayback({ destroyAmr: true });
    };
  }, [stopPlayback]);

  const handlePlayClick = async () => {
    if (!content.audioUrl) {
      return;
    }

    let generation: number | undefined;

    try {
      generation = claimActivePlayback();

      if (isAmrUrl(content.audioUrl)) {
        await playAmrVoice(content.audioUrl);
        return;
      }

      if (!audioRef.current || audioRef.current.src !== content.audioUrl) {
        amrRef.current?.stop();
        audioRef.current?.pause();
        audioRef.current = new Audio(content.audioUrl);
        audioRef.current.addEventListener("ended", finishPlayback);
        audioRef.current.addEventListener("error", failPlayback);
      }

      if (!isCurrentPlayback(generation)) {
        return;
      }

      audioRef.current.currentTime = 0;
      setPlaybackState("playing");
      await audioRef.current.play();
    } catch {
      if (generation == null || isCurrentPlayback(generation)) {
        failPlayback();
      }
    }
  };

  const playAmrVoice = async (audioUrl: string) => {
    audioRef.current?.pause();
    const generation = playbackGeneration;

    if (amrUrlRef.current !== audioUrl) {
      destroyAmrRecorder(amrRef.current);
      amrBlobRef.current = null;
      amrRef.current = null;
      amrUrlRef.current = null;
    }

    if (!amrRef.current) {
      amrRef.current = new BenzAMRRecorder();
      amrRef.current.onEnded(finishPlayback);
      amrRef.current.onStop(finishPlayback);
    }

    if (!amrRef.current.isInit()) {
      if (shouldProxyAmrAudio()) {
        amrBlobRef.current ??= await downloadAmrVoice(audioUrl);
        await amrRef.current.initWithBlob(amrBlobRef.current);
      } else {
        await amrRef.current.initWithUrl(audioUrl);
      }

      amrUrlRef.current = audioUrl;
    }

    if (!isCurrentPlayback(generation)) {
      return;
    }

    setPlaybackState("playing");
    amrRef.current.play();
  };

  return (
    <button
      aria-label={canPlay ? `播放语音消息 ${label}` : "语音消息不可播放"}
      className={cn(
        "relative inline-flex min-h-10 min-w-28 items-center gap-2.5 rounded-[12px] px-3.5 py-1.5 outline-none transition-[filter] focus-visible:ring-4 focus-visible:ring-ring/25",
        canPlay ? "cursor-pointer hover:brightness-[0.98]" : "cursor-not-allowed opacity-70",
        bubbleTone,
      )}
      disabled={!canPlay}
      onClick={handlePlayClick}
      type="button"
    >
      <HugeiconsIcon
        className="relative z-1 shrink-0 text-foreground"
        data-testid="voice-volume-icon"
        data-volume-icon="high"
        icon={VolumeHighIcon}
        size={18}
        strokeWidth={1.9}
      />
      <span className="relative z-1 shrink-0 text-[14px] leading-none text-foreground">
        {playbackState === "error"
          ? "暂不可播放"
          : playbackState === "playing"
            ? "播放中"
            : label}
      </span>
    </button>
  );
}

function isAmrUrl(url: string) {
  return /\.amr(?:[?#].*)?$/i.test(url);
}

function shouldProxyAmrAudio() {
  return import.meta.env.DEV;
}

function downloadAmrVoice(url: string) {
  return request<Blob>({
    method: "GET",
    params: {
      url,
    },
    responseType: "blob",
    url: "/server/media/proxy",
  });
}

function destroyAmrRecorder(recorder: BenzAMRRecorder | null) {
  try {
    recorder?.destroy();
  } catch (error) {
    if (!isKnownAmrDestroyError(error)) {
      throw error;
    }
  }
}

function isKnownAmrDestroyError(error: unknown) {
  return (
    error instanceof TypeError &&
    error.message.includes("Cannot set properties of null")
  );
}
