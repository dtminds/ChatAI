import { VolumeHighIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "@/lib/request";
import { cn } from "@/lib/utils";
import type { VoiceMessageContent } from "@/pages/chat/chat-types";
import type { WorkbenchPlayableVoiceResponse } from "@chatai/contracts";

type VoiceMessageCardProps = {
  content: VoiceMessageContent;
  isAgent: boolean;
};

type ActiveVoicePlayback = {
  id: symbol;
  stop: () => void;
};

let activeVoicePlayback: ActiveVoicePlayback | null = null;
let playbackGeneration = 0;

export function VoiceMessageCard({
  content,
  isAgent,
}: VoiceMessageCardProps) {
  const bubbleTone = isAgent ? "bg-primary/10" : "bg-secondary";
  const playbackIdRef = useRef(Symbol("voice-message-playback"));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackState, setPlaybackState] = useState<
    "idle" | "playing" | "error" | "not-ready"
  >("idle");
  const canPlay = Boolean(content.audioUrl);
  const label = content.durationLabel || "语音";

  const clearActivePlayback = useCallback(() => {
    if (activeVoicePlayback?.id === playbackIdRef.current) {
      activeVoicePlayback = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
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
      stopPlayback();
    };
  }, [stopPlayback]);

  const handlePlayClick = async () => {
    if (!content.audioUrl) {
      return;
    }

    let generation: number | undefined;

    try {
      generation = claimActivePlayback();
      const playableUrl = isAmrUrl(content.audioUrl)
        ? await resolvePlayableVoiceUrl(content.audioUrl)
        : content.audioUrl;

      if (!isCurrentPlayback(generation)) {
        return;
      }

      if (!playableUrl) {
        clearActivePlayback();
        setPlaybackState("not-ready");
        return;
      }

      await playNativeAudio(playableUrl, generation);
    } catch {
      if (generation == null || isCurrentPlayback(generation)) {
        failPlayback();
      }
    }
  };

  const playNativeAudio = async (audioUrl: string, generation: number) => {
    if (!audioRef.current || audioRef.current.src !== audioUrl) {
      audioRef.current?.pause();
      audioRef.current = new Audio(audioUrl);
      audioRef.current.addEventListener("ended", finishPlayback);
      audioRef.current.addEventListener("error", failPlayback);
    }

    if (!isCurrentPlayback(generation)) {
      return;
    }

    audioRef.current.currentTime = 0;
    setPlaybackState("playing");
    await audioRef.current.play();
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
          : playbackState === "not-ready"
            ? "暂不支持播放，请稍后重试"
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

async function resolvePlayableVoiceUrl(url: string) {
  const response = await request<{ data: WorkbenchPlayableVoiceResponse }>({
    method: "GET",
    params: {
      url,
    },
    url: "/server/media/playable-voice",
  });

  return response.data.playable ? response.data.playableUrl : undefined;
}
