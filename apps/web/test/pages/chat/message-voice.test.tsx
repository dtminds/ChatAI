import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchMessageDto } from "@chatai/contracts";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { VoiceMessageCard } from "@/pages/chat/components/message";

const mocks = vi.hoisted(() => ({
  amrDestroy: vi.fn(),
  amrInitWithBlob: vi.fn().mockResolvedValue(undefined),
  amrInitWithUrl: vi.fn().mockResolvedValue(undefined),
  amrIsInit: vi.fn(() => false),
  amrOnEnded: vi.fn(),
  amrOnStop: vi.fn(),
  amrPlay: vi.fn(),
  amrStop: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@/lib/request", () => ({
  request: mocks.request,
}));

vi.mock("benz-amr-recorder", () => ({
  default: vi.fn(function BenzAMRRecorderMock(this: {
    destroy: typeof mocks.amrDestroy;
    initWithBlob: typeof mocks.amrInitWithBlob;
    initWithUrl: typeof mocks.amrInitWithUrl;
    isInit: typeof mocks.amrIsInit;
    onEnded: typeof mocks.amrOnEnded;
    onStop: typeof mocks.amrOnStop;
    play: typeof mocks.amrPlay;
    stop: typeof mocks.amrStop;
  }) {
    this.destroy = mocks.amrDestroy;
    this.initWithBlob = mocks.amrInitWithBlob;
    this.initWithUrl = mocks.amrInitWithUrl;
    this.isInit = mocks.amrIsInit;
    this.onEnded = mocks.amrOnEnded;
    this.onStop = mocks.amrOnStop;
    this.play = mocks.amrPlay;
    this.stop = mocks.amrStop;
  }),
}));

describe("voice message playback", () => {
  afterEach(() => {
    mocks.amrDestroy.mockClear();
    mocks.amrInitWithBlob.mockClear();
    mocks.amrInitWithBlob.mockResolvedValue(undefined);
    mocks.amrInitWithUrl.mockClear();
    mocks.amrInitWithUrl.mockResolvedValue(undefined);
    mocks.amrIsInit.mockClear();
    mocks.amrIsInit.mockReturnValue(false);
    mocks.amrOnEnded.mockClear();
    mocks.amrOnStop.mockClear();
    mocks.amrPlay.mockClear();
    mocks.amrStop.mockClear();
    mocks.request.mockClear();
    mocks.request.mockResolvedValue(new Blob(["amr"]));
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mocks.request.mockResolvedValue(new Blob(["amr"]));
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

  it("plays AMR voice messages through the media proxy in development", async () => {
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
      expect(mocks.request).toHaveBeenCalledWith({
        method: "GET",
        params: {
          url: "https://b3.iyouke.com/bilin/20260421/272/voice.amr",
        },
        responseType: "blob",
        url: "/server/media/proxy",
      });
      expect(mocks.amrInitWithBlob).toHaveBeenCalledWith(expect.any(Blob));
      expect(mocks.amrInitWithUrl).not.toHaveBeenCalled();
      expect(mocks.amrPlay).toHaveBeenCalledTimes(1);
    });
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
      expect(mocks.amrPlay).toHaveBeenCalledTimes(1);
    });

    const icon = screen.getByTestId("voice-volume-icon");

    expect(icon).toHaveAttribute("data-volume-icon", "high");
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(icon).toHaveAttribute("data-volume-icon", "high");
  });

  it("stops the previous voice message before playing another one", async () => {
    const user = userEvent.setup();

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
      expect(mocks.amrPlay).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "播放语音消息 12\"" }));

    await waitFor(() => {
      expect(mocks.amrStop).toHaveBeenCalledTimes(1);
      expect(mocks.amrPlay).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: "播放语音消息 11\"" })).toHaveTextContent(
      "11\"",
    );
  });

  it("does not let stale AMR initialization resume after another voice claims playback", async () => {
    const user = userEvent.setup();
    let resolveFirstDownload!: (value: Blob) => void;
    const firstDownload = new Promise<Blob>((resolve) => {
      resolveFirstDownload = resolve;
    });

    mocks.request
      .mockReturnValueOnce(firstDownload)
      .mockResolvedValue(new Blob(["second-amr"]));

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
      expect(mocks.amrPlay).toHaveBeenCalledTimes(1);
    });

    resolveFirstDownload(new Blob(["first-amr"]));

    await waitFor(() => {
      expect(mocks.amrInitWithBlob).toHaveBeenCalledTimes(2);
    });
    expect(mocks.amrPlay).toHaveBeenCalledTimes(1);
  });

  it("stops playback when the voice message unmounts", async () => {
    const user = userEvent.setup();
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
      expect(mocks.amrPlay).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(mocks.amrStop).not.toHaveBeenCalled();
    expect(mocks.amrDestroy).toHaveBeenCalledTimes(1);
  });

  it("does not stop AMR before destroying it on unmount", async () => {
    const user = userEvent.setup();
    mocks.amrDestroy.mockImplementationOnce(() => undefined);
    mocks.amrStop.mockImplementationOnce(() => {
      throw new TypeError("Cannot set properties of null (setting 'onended')");
    });
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
      expect(mocks.amrPlay).toHaveBeenCalledTimes(1);
    });

    expect(() => unmount()).not.toThrow();
    expect(mocks.amrStop).not.toHaveBeenCalled();
    expect(mocks.amrDestroy).toHaveBeenCalledTimes(1);
  });

  it("plays AMR voice messages from the original URL in production", async () => {
    vi.stubEnv("DEV", false);
    const user = userEvent.setup();

    render(
      <VoiceMessageCard
        content={{
          type: "voice",
          audioUrl: "https://b3.bork.com.cn/bilin/20260421/272/voice.amr",
          durationLabel: "11\"",
        }}
        isAgent={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));

    await waitFor(() => {
      expect(mocks.amrInitWithUrl).toHaveBeenCalledWith(
        "https://b3.bork.com.cn/bilin/20260421/272/voice.amr",
      );
      expect(mocks.amrPlay).toHaveBeenCalledTimes(1);
    });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.amrInitWithBlob).not.toHaveBeenCalled();
  });

  it("plays browser-supported voice message URLs with native Audio", async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const load = vi.fn();

    vi.stubGlobal(
      "Audio",
      vi.fn(function AudioMock(this: {
        addEventListener: ReturnType<typeof vi.fn>;
        currentTime: number;
        load: typeof load;
        pause: typeof pause;
        play: typeof play;
        removeEventListener: ReturnType<typeof vi.fn>;
        src: string;
      }, src: string) {
        this.addEventListener = vi.fn();
        this.currentTime = 0;
        this.load = load;
        this.pause = pause;
        this.play = play;
        this.removeEventListener = vi.fn();
        this.src = src;
      }),
    );

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
    expect(mocks.amrInitWithUrl).not.toHaveBeenCalled();
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
    status: "read",
  };
}
