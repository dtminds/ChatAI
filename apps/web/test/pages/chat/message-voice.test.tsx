import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchMessageDto } from "@chatai/contracts";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { VoiceMessageCard } from "@/pages/chat/components/message";

type AudioMockInstance = {
  addEventListener: ReturnType<typeof vi.fn>;
  currentTime: number;
  dispatch: (event: string) => void;
  duration: number;
  ended: boolean;
  load: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  paused: boolean;
  play: ReturnType<typeof vi.fn>;
  readyState: number;
  removeEventListener: ReturnType<typeof vi.fn>;
  src: string;
};

describe("voice message playback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("adapts voice audio URLs from backend messages", () => {
    const message = adaptMessage(createVoiceDto(), {}, {}, undefined);

    expect(message.content).toMatchObject({
      type: "voice",
      audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
      durationLabel: "",
    });
  });

  it("uses hydrated sender metadata from backend messages", () => {
    const message = adaptMessage(
      {
        ...createVoiceDto(),
        senderAvatar: "https://example.com/sender.png",
        senderName: "后端补全昵称",
      },
      {
        "customer-voice": {
          avatarUrl: "https://example.com/profile.png",
          city: "",
          id: "customer-voice",
          intentScore: 0,
          metrics: [],
          name: "客户档案昵称",
          notes: [],
          persona: "",
          phone: "",
          stage: "",
          tags: [],
          tasks: [],
        },
      },
      {},
      undefined,
    );

    expect(message).toMatchObject({
      author: "后端补全昵称",
      sender: {
        avatarUrl: "https://example.com/sender.png",
        name: "后端补全昵称",
      },
    });
  });

  it("plays AMR voice messages through the converted WAV URL", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    const { AudioMock } = stubAudio({ play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(AudioMock).toHaveBeenCalledWith(
        "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
      );
      expect(play).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps preparing until backend-provided converted WAV metadata loads", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances, play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button")).toHaveTextContent("准备播放");

    audioInstances[0]!.duration = 11;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("播放中");
    });

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
  });

  it("plays after the StrictMode effect remount check", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances, play });

    render(
      <StrictMode>
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
            durationLabel: "11\"",
            playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
          }}
          isAgent={false}
        />
      </StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button")).toHaveTextContent("准备播放");

    audioInstances[0]!.duration = 11;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("播放中");
    });
  });

  it("shows a retry-later message when AMR has no backend playback URL", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    stubAudio({ play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/image/20260513/272/image.amr",
          durationLabel: "11\"",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("暂不支持播放，请稍后重试");
    });
    expect(play).not.toHaveBeenCalled();
  });

  it("shows a playback error when browser audio playback is rejected", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    stubAudio({ play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("暂不可播放");
    });
  });

  it("keeps showing playing after the converted WAV starts", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances, play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
    audioInstances[0]!.duration = 11;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("播放中");
    });
  });

  it("renders the original voice bubble before playback starts", () => {
    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    expect(screen.getByRole("button", { name: "播放语音消息 11\"" })).toHaveTextContent(
      "11\"",
    );
    expect(screen.getByTestId("voice-volume-icon")).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "语音播放进度" })).not.toBeInTheDocument();
  });

  it("renders a compact progress player after playback starts", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    audioInstances[0]!.duration = 58;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "暂停语音消息 11\"" })).toBeInTheDocument();
    });
    expect(screen.getByRole("slider", { name: "语音播放进度" })).toBeInTheDocument();
    expect(screen.getByText("58\"")).toBeInTheDocument();
  });

  it("notifies when an unpersisted converted voice is ready to play", async () => {
    const user = userEvent.setup();
    const onPlaybackReady = vi.fn();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
          transFileUrlPersisted: false,
        }}
        isAgent={false}
        onPlaybackReady={onPlaybackReady}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));
    audioInstances[0]!.duration = 58;
    audioInstances[0]!.dispatch("loadedmetadata");
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(onPlaybackReady).toHaveBeenCalledTimes(1);
    });
    expect(onPlaybackReady).toHaveBeenCalledWith({
      playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
    });
  });

  it("keeps playing when playback readiness persistence updates the voice props", async () => {
    const user = userEvent.setup();
    const pause = vi.fn();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances, pause });

    function PersistingVoiceMessage() {
      const [isPersisted, setIsPersisted] = useState(false);

      return (
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
            durationLabel: "4\"",
            playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
            transFileUrlPersisted: isPersisted,
          }}
          isAgent={false}
          onPlaybackReady={() => setIsPersisted(true)}
        />
      );
    }

    render(<PersistingVoiceMessage />);

    await user.click(screen.getByRole("button", { name: "播放语音消息 4\"" }));
    audioInstances[0]!.duration = 4;
    audioInstances[0]!.currentTime = 1;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("播放中");
    });
    expect(pause).not.toHaveBeenCalled();
    expect(screen.getByRole("slider", { name: "语音播放进度" })).toHaveValue("1");
  });

  it("does not notify playback readiness before metadata loads", async () => {
    const user = userEvent.setup();
    const onPlaybackReady = vi.fn();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
          transFileUrlPersisted: false,
        }}
        isAgent={false}
        onPlaybackReady={onPlaybackReady}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));
    audioInstances[0]!.dispatch("pause");

    expect(onPlaybackReady).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveTextContent("准备播放");
  });

  it("updates the progress bar as audio time changes", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    audioInstances[0]!.duration = 58;
    audioInstances[0]!.currentTime = 32;
    audioInstances[0]!.dispatch("loadedmetadata");
    audioInstances[0]!.dispatch("timeupdate");

    await waitFor(() => {
      expect(screen.getByRole("slider", { name: "语音播放进度" })).toHaveValue("32");
    });
  });

  it("seeks audio when dragging the progress control", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    audioInstances[0]!.duration = 58;
    audioInstances[0]!.dispatch("loadedmetadata");

    const slider = await screen.findByRole("slider", { name: "语音播放进度" });
    await waitFor(() => {
      expect(slider).toHaveAttribute("max", "58");
    });
    fireEvent.change(slider, {
      target: { value: "32" },
    });

    expect(audioInstances[0]?.currentTime).toBe(32);
  });

  it("does not fail playback when audio metadata is not ready yet", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances, throwOnCurrentTimeBeforeMetadata: true });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("准备播放");
    });
    expect(audioInstances[0]?.currentTime).toBe(0);
  });

  it("pauses and resumes the same voice message from the player button", async () => {
    const user = userEvent.setup();
    const pause = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances, pause, play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));
    audioInstances[0]!.duration = 58;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "暂停语音消息 11\"" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "暂停语音消息 11\"" }));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "播放语音消息 11\"" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    expect(play).toHaveBeenCalledTimes(2);
  });

  it("keeps preparing when browser audio play is still pending", async () => {
    const user = userEvent.setup();
    const play = vi.fn(() => new Promise<void>(() => undefined));
    stubAudio({ play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button")).toHaveTextContent("准备播放");
  });

  it("returns to the duration label when playback ends", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    audioInstances[0]!.duration = 11;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("播放中");
    });

    audioInstances[0]?.dispatch("ended");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("11\"");
    });
    expect(screen.getByTestId("voice-volume-icon")).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "语音播放进度" })).not.toBeInTheDocument();
  });

  it("returns to the duration label when audio is paused at the end", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    audioInstances[0]!.duration = 11;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("播放中");
    });

    audioInstances[0]!.currentTime = 11;
    audioInstances[0]!.duration = 11;
    audioInstances[0]!.dispatch("pause");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("11\"");
    });
  });

  it("requests transcription and displays the returned text", async () => {
    const user = userEvent.setup();
    const onTranscribe = vi.fn().mockResolvedValue("这是一条语音文本");

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
          transVoiceText: "",
        }}
        isAgent={false}
        onTranscribe={onTranscribe}
      />,
    );

    await user.click(screen.getByRole("button", { name: "转文字" }));

    expect(onTranscribe).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("这是一条语音文本")).toBeInTheDocument();
  });

  it("does not update transcription state after unmounting during a request", async () => {
    const user = userEvent.setup();
    let resolveTranscription: (value: string) => void = () => undefined;
    const onTranscribe = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => {
        resolveTranscription = resolve;
      }),
    );
    const { unmount } = render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
          transVoiceText: "",
        }}
        isAgent={false}
        onTranscribe={onTranscribe}
      />,
    );

    await user.click(screen.getByRole("button", { name: "转文字" }));
    unmount();
    resolveTranscription("卸载后的语音文本");

    await waitFor(() => {
      expect(onTranscribe).toHaveBeenCalledTimes(1);
    });
  });

  it("shows existing voice transcription without a transcription button", () => {
    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
          transVoiceText: "已经存在的语音文本",
        }}
        isAgent={false}
        onTranscribe={vi.fn()}
      />,
    );

    expect(screen.getByText("已经存在的语音文本")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "转文字" })).not.toBeInTheDocument();
  });

  it("allows retrying transcription after a failed request", async () => {
    const user = userEvent.setup();
    const onTranscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error("识别失败"))
      .mockResolvedValueOnce("重试后的语音文本");

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
          transVoiceText: "",
        }}
        isAgent={false}
        onTranscribe={onTranscribe}
      />,
    );

    await user.click(screen.getByRole("button", { name: "转文字" }));

    expect(await screen.findByText("转文字失败")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新转文字" }));

    expect(await screen.findByText("重试后的语音文本")).toBeInTheDocument();
    expect(onTranscribe).toHaveBeenCalledTimes(2);
  });

  it("shows a retry-later message when converted voice is not ready", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    stubAudio({ play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("暂不支持播放，请稍后重试");
    });
    expect(play).not.toHaveBeenCalled();
  });

  it("releases audio when converted voice fails before metadata loads", async () => {
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260513/272/voice.wav",
        }}
        isAgent={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    expect(screen.getByRole("button")).toHaveTextContent("准备播放");
    const loadCallsBeforeRelease = audioInstances[0]?.load.mock.calls.length;
    audioInstances[0]!.dispatch("error");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("暂不支持播放，请稍后重试");
    });
    expect(audioInstances[0]?.pause).toHaveBeenCalledTimes(1);
    expect(audioInstances[0]?.removeEventListener).toHaveBeenCalledWith(
      "loadedmetadata",
      expect.any(Function),
    );
    expect(audioInstances[0]?.removeEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
    expect(audioInstances[0]?.src).toBe("");
    expect(audioInstances[0]?.load).toHaveBeenCalledTimes((loadCallsBeforeRelease ?? 0) + 1);
  });

  it("does not attempt native playback for SILK voice messages without converted URL", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    stubAudio({ play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b5.bokr.com.cn/s5/msg/20260513/272/voice.silk",
          durationLabel: "11\"",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("暂不支持播放，请稍后重试");
    });
    expect(play).not.toHaveBeenCalled();
  });

  it("switches the voice control icon between play and pause states", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
        }}
        isAgent={false}
      />,
    );

    expect(screen.getByTestId("voice-volume-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("voice-playback-icon")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));
    audioInstances[0]!.duration = 11;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(screen.getByTestId("voice-playback-icon")).toHaveAttribute(
        "data-playback-icon",
        "pause",
      );
    });

    await user.click(screen.getByRole("button", { name: "暂停语音消息 11\"" }));

    expect(screen.getByTestId("voice-playback-icon")).toHaveAttribute(
      "data-playback-icon",
      "play",
    );
  });

  it("stops the previous voice message before playing another one", async () => {
    const user = userEvent.setup();
    const firstPause = vi.fn();
    const secondPlay = vi.fn().mockResolvedValue(undefined);
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({
      instances: audioInstances,
      pause: firstPause,
      play: vi.fn().mockResolvedValue(undefined),
      playSequence: [vi.fn().mockResolvedValue(undefined), secondPlay],
    });

    render(
      <div>
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b3.iyouke.com/bilin/20260421/272/first.amr",
            durationLabel: "11\"",
            playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/first.wav",
          }}
          isAgent={false}
        />
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b3.iyouke.com/bilin/20260421/272/second.amr",
            durationLabel: "12\"",
            playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/second.wav",
          }}
          isAgent={false}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(audioInstances).toHaveLength(1);
    });

    await user.click(screen.getByRole("button", { name: "播放语音消息 12\"" }));

    await waitFor(() => {
      expect(secondPlay).toHaveBeenCalledTimes(1);
    });
    expect(audioInstances[0]?.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "播放语音消息 11\"" })).toHaveTextContent(
      "11\"",
    );
  });

  it("keeps only the latest voice active after another voice claims playback", async () => {
    const user = userEvent.setup();
    const firstPlay = vi.fn().mockResolvedValue(undefined);
    const secondPlay = vi.fn().mockResolvedValue(undefined);
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({
      instances: audioInstances,
      playSequence: [firstPlay, secondPlay],
    });

    render(
      <div>
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b3.iyouke.com/bilin/20260421/272/first.amr",
            durationLabel: "11\"",
            playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/first.wav",
          }}
          isAgent={false}
        />
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b3.iyouke.com/bilin/20260421/272/second.amr",
            durationLabel: "12\"",
            playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/second.wav",
          }}
          isAgent={false}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));
    await user.click(screen.getByRole("button", { name: "播放语音消息 12\"" }));

    await waitFor(() => {
      expect(secondPlay).toHaveBeenCalledTimes(1);
    });

    expect(firstPlay).toHaveBeenCalledTimes(1);
    expect(audioInstances[0]?.pause).toHaveBeenCalledTimes(1);
  });

  it("stops playback when the voice message unmounts", async () => {
    const user = userEvent.setup();
    const pause = vi.fn();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances, pause });
    const { unmount } = render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(audioInstances).toHaveLength(1);
    });

    const loadCallsBeforeRelease = audioInstances[0]?.load.mock.calls.length;
    unmount();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(audioInstances[0]?.removeEventListener).toHaveBeenCalledWith(
      "ended",
      expect.any(Function),
    );
    expect(audioInstances[0]?.removeEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
    expect(audioInstances[0]?.src).toBe("");
    expect(audioInstances[0]?.load).toHaveBeenCalledTimes((loadCallsBeforeRelease ?? 0) + 1);
  });

  it("removes audio listeners with the originally registered references after props change", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });
    const { rerender, unmount } = render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
          transFileUrlPersisted: false,
        }}
        isAgent={false}
        onPlaybackReady={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(audioInstances).toHaveLength(1);
    });

    const audio = audioInstances[0]!;
    const registeredListeners = new Map(
      audio.addEventListener.mock.calls.map(([event, listener]) => [event, listener]),
    );

    rerender(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
          transFileUrlPersisted: false,
        }}
        isAgent={false}
        onPlaybackReady={vi.fn()}
      />,
    );
    unmount();

    for (const event of ["pause", "loadedmetadata", "timeupdate", "ended", "error"]) {
      expect(audio.removeEventListener).toHaveBeenCalledWith(
        event,
        registeredListeners.get(event),
      );
    }
  });

  it("removes listeners from the previous audio element when the URL changes", async () => {
    const user = userEvent.setup();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({
      instances: audioInstances,
      playSequence: [
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(undefined),
      ],
    });

    const { rerender } = render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/first.amr",
          durationLabel: "11\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/first.wav",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));
    await waitFor(() => {
      expect(audioInstances).toHaveLength(1);
    });

    rerender(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/second.amr",
          durationLabel: "12\"",
          playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/second.wav",
        }}
        isAgent={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "播放语音消息 12\"" }));

    await waitFor(() => {
      expect(audioInstances).toHaveLength(2);
    });
    expect(audioInstances[0]?.removeEventListener).toHaveBeenCalledWith(
      "ended",
      expect.any(Function),
    );
    expect(audioInstances[0]?.removeEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
  });

  it("plays browser-supported voice message URLs with native Audio", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    stubAudio({ play });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.mp3",
          durationLabel: "11\"",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
  });

  it("disables playback when the voice message has no URL", () => {
    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          durationLabel: "语音",
        }}
        isAgent={false}
      />,
    );

    expect(screen.getByRole("button", { name: "语音消息不可播放" })).toBeDisabled();
  });
});

function stubAudio({
  instances = [],
  pause = vi.fn(),
  play = vi.fn().mockResolvedValue(undefined),
  playSequence,
  throwOnCurrentTimeBeforeMetadata = false,
}: {
  instances?: AudioMockInstance[];
  pause?: ReturnType<typeof vi.fn>;
  play?: ReturnType<typeof vi.fn>;
  playSequence?: Array<ReturnType<typeof vi.fn>>;
  throwOnCurrentTimeBeforeMetadata?: boolean;
} = {}) {
  const listeners = new WeakMap<AudioMockInstance, Map<string, EventListener[]>>();
  const AudioMock = vi.fn(function AudioMock(this: AudioMockInstance, src: string) {
    const instanceListeners = new Map<string, EventListener[]>();
    listeners.set(this, instanceListeners);
    this.addEventListener = vi.fn((event: string, listener: EventListener) => {
      instanceListeners.set(event, [...(instanceListeners.get(event) ?? []), listener]);
    });
    let currentTime = 0;
    Object.defineProperty(this, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        if (throwOnCurrentTimeBeforeMetadata && this.readyState < 1) {
          throw new DOMException("The media resource is not ready", "InvalidStateError");
        }
        currentTime = value;
      },
    });
    this.dispatch = (event: string) => {
      if (event === "loadedmetadata") {
        this.paused = false;
        this.readyState = 1;
      }
      if (event === "timeupdate") {
        this.paused = false;
      }
      if (event === "ended") {
        this.ended = true;
        this.paused = true;
      }
      if (event === "pause") {
        this.paused = true;
      }
      for (const listener of instanceListeners.get(event) ?? []) {
        listener(new Event(event));
      }
    };
    this.duration = 0;
    this.ended = false;
    this.load = vi.fn();
    this.pause = instances.length === 0 ? pause : vi.fn();
    this.paused = true;
    this.play = playSequence?.[instances.length] ?? play;
    this.readyState = 0;
    this.removeEventListener = vi.fn((event: string, listener: EventListener) => {
      instanceListeners.set(
        event,
        (instanceListeners.get(event) ?? []).filter((candidate) => candidate !== listener),
      );
    });
    this.src = src;
    instances.push(this);
  });

  vi.stubGlobal("Audio", AudioMock);

  return { AudioMock, instances };
}

function createVoiceDto(): WorkbenchMessageDto {
  return {
    content: {
      audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
      durationLabel: "",
    },
    contentType: "voice",
    conversationId: "conv-voice",
    createdAt: 1778219705000,
    customerId: "customer-voice",
    messageId: "msg-voice",
    seatId: "seat-voice",
    senderType: "customer",
    seq: 1,
    status: "sent",
  };
}
