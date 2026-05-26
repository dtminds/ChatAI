import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchMessageDto } from "@chatai/contracts";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { VoiceMessageCard } from "@/pages/chat/components/message";

type AudioMockInstance = {
  addEventListener: ReturnType<typeof vi.fn>;
  currentTime: number;
  dispatch: (event: string) => void;
  duration: number;
  ended: boolean;
  pause: ReturnType<typeof vi.fn>;
  paused: boolean;
  play: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  src: string;
};

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("@/lib/request", () => ({
  request: mocks.request,
}));

describe("voice message playback", () => {
  afterEach(() => {
    mocks.request.mockClear();
    mocks.request.mockResolvedValue({
      data: {
        playable: true,
        playableUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
      },
      success: true,
    });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mocks.request.mockResolvedValue({
      data: {
        playable: true,
        playableUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
      },
      success: true,
    });
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
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith({
        method: "GET",
        params: {
          url: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
        },
        url: "/server/media/playable-voice",
      });
      expect(AudioMock).toHaveBeenCalledWith(
        "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
      );
      expect(play).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a preparing state while checking the converted voice URL", async () => {
    const user = userEvent.setup();
    let resolveCheck!: (value: unknown) => void;
    const playableCheck = new Promise((resolve) => {
      resolveCheck = resolve;
    });
    const play = vi.fn().mockResolvedValue(undefined);
    stubAudio({ play });
    mocks.request.mockReturnValueOnce(playableCheck);

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

    expect(screen.getByRole("button")).toHaveTextContent("准备播放");
    expect(play).not.toHaveBeenCalled();

    resolveCheck({
      data: {
        playable: true,
        playableUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
      },
      success: true,
    });

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a playback error when the playable voice check is rejected", async () => {
    const user = userEvent.setup();
    stubAudio();
    mocks.request.mockRejectedValueOnce(new Error("MEDIA_URL_NOT_ALLOWED"));

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
      expect(screen.getByRole("button")).toHaveTextContent("暂不可播放");
    });
  });

  it("keeps showing playing after the converted WAV starts", async () => {
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
      expect(play).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button")).toHaveTextContent("播放中");
  });

  it("shows playing even when browser audio play is still pending", async () => {
    const user = userEvent.setup();
    const play = vi.fn(() => new Promise<void>(() => undefined));
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
      expect(play).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button")).toHaveTextContent("播放中");
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
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("播放中");
    });

    audioInstances[0]?.dispatch("ended");

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("11\"");
    });
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
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

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

  it("shows a retry-later message when converted voice is not ready", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    stubAudio({ play });
    mocks.request.mockResolvedValueOnce({
      data: {
        playable: false,
      },
      success: true,
    });

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
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

  it("keeps the volume icon static while a voice message is playing", async () => {
    const user = userEvent.setup();

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
          durationLabel: "11\"",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledTimes(1);
    });

    const icon = screen.getByTestId("voice-volume-icon");

    expect(icon).toHaveAttribute("data-volume-icon", "high");
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(icon).toHaveAttribute("data-volume-icon", "high");
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
          }}
          isAgent={false}
        />
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b3.iyouke.com/bilin/20260421/272/second.amr",
            durationLabel: "12\"",
          }}
          isAgent={false}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "播放语音消息 12\"" }));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledTimes(2);
      expect(secondPlay).toHaveBeenCalledTimes(1);
    });
    expect(audioInstances[0]?.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "播放语音消息 11\"" })).toHaveTextContent(
      "11\"",
    );
  });

  it("does not let a stale playable voice check resume after another voice claims playback", async () => {
    const user = userEvent.setup();
    let resolveFirstCheck!: (value: unknown) => void;
    const firstCheck = new Promise((resolve) => {
      resolveFirstCheck = resolve;
    });
    const play = vi.fn().mockResolvedValue(undefined);
    stubAudio({ play });

    mocks.request
      .mockReturnValueOnce(firstCheck)
      .mockResolvedValue({
        data: {
          playable: true,
          playableUrl: "https://b5.bokr.com.cn/s5/playable-voice/second.wav",
        },
        success: true,
      });

    render(
      <div>
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b3.iyouke.com/bilin/20260421/272/first.amr",
            durationLabel: "11\"",
          }}
          isAgent={false}
        />
        <VoiceMessageCard
          content={{
            type: "voice",
            audioUrl: "https://b3.iyouke.com/bilin/20260421/272/second.amr",
            durationLabel: "12\"",
          }}
          isAgent={false}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));
    await user.click(screen.getByRole("button", { name: "播放语音消息 12\"" }));

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });

    resolveFirstCheck({
      data: {
        playable: true,
        playableUrl: "https://b5.bokr.com.cn/s5/playable-voice/first.wav",
      },
      success: true,
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(play).toHaveBeenCalledTimes(1);
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
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledTimes(1);
    });

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
    mocks.request
      .mockResolvedValueOnce({
        data: {
          playable: true,
          playableUrl: "https://b5.bokr.com.cn/s5/playable-voice/first.wav",
        },
        success: true,
      })
      .mockResolvedValueOnce({
        data: {
          playable: true,
          playableUrl: "https://b5.bokr.com.cn/s5/playable-voice/second.wav",
        },
        success: true,
      });

    const { rerender } = render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.iyouke.com/bilin/20260421/272/first.amr",
          durationLabel: "11\"",
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
    expect(mocks.request).not.toHaveBeenCalled();
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
}: {
  instances?: AudioMockInstance[];
  pause?: ReturnType<typeof vi.fn>;
  play?: ReturnType<typeof vi.fn>;
  playSequence?: Array<ReturnType<typeof vi.fn>>;
} = {}) {
  const listeners = new WeakMap<AudioMockInstance, Map<string, EventListener[]>>();
  const AudioMock = vi.fn(function AudioMock(this: AudioMockInstance, src: string) {
    const instanceListeners = new Map<string, EventListener[]>();
    listeners.set(this, instanceListeners);
    this.addEventListener = vi.fn((event: string, listener: EventListener) => {
      instanceListeners.set(event, [...(instanceListeners.get(event) ?? []), listener]);
    });
    this.currentTime = 0;
    this.dispatch = (event: string) => {
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
    this.pause = instances.length === 0 ? pause : vi.fn();
    this.paused = true;
    this.play = playSequence?.[instances.length] ?? play;
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
