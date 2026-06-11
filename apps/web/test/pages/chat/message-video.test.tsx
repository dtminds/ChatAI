import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, VideoMessageContent } from "@/pages/chat/chat-types";
import { MessageContentRenderer, VideoMessageCard } from "@/pages/chat/components/message";

describe("MessageContentRenderer video messages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a horizontal video preview with a play control and duration", () => {
    render(
      <MessageContentRenderer
        isAgent={false}
        message={createVideoMessage({
          alt: "舞台活动视频封面",
          durationLabel: "1:01",
          height: 360,
          width: 640,
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "舞台活动视频封面" })).toHaveAttribute(
      "src",
      "/covers/stage.jpg",
    );
    expect(screen.getByRole("img", { name: "舞台活动视频封面" }).parentElement).toHaveStyle({
      aspectRatio: "300 / 168.75",
      maxWidth: "100%",
      width: "300px",
    });
    expect(screen.getByRole("button", { name: "播放视频：舞台活动视频封面" })).toBeInTheDocument();
    expect(screen.getByText("1:01")).toBeInTheDocument();
  });

  it("uses the optimized b5 image URL for video covers", () => {
    const coverImageUrl =
      "https://b5.bokr.com.cn/s5/20260511/272/fa4ccebe1fa94d60997824dd1a22656b.jpg";

    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "b5 视频封面",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          coverImageUrl,
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "b5 视频封面" })).toHaveAttribute(
      "src",
      `${coverImageUrl}!w480.webp`,
    );
  });

  it("renders a vertical video preview from the same content contract", () => {
    render(
      <MessageContentRenderer
        isAgent={false}
        message={createVideoMessage({
          alt: "湖面竖版视频封面",
          durationLabel: "0:11",
          height: 640,
          width: 360,
        })}
      />,
    );

    const cover = screen.getByRole("img", { name: "湖面竖版视频封面" });

    expect(cover).toHaveAttribute("height", "640");
    expect(cover).toHaveAttribute("width", "360");
    expect(cover.parentElement).toHaveStyle({
      aspectRatio: "202.5 / 360",
      maxWidth: "100%",
      width: "202.5px",
    });
    expect(cover).toHaveClass("object-cover");
    expect(screen.getByRole("button", { name: "播放视频：湖面竖版视频封面" })).toBeInTheDocument();
    expect(screen.getByText("0:11")).toBeInTheDocument();
  });

  it("calls the optional play handler when the play control is clicked", async () => {
    const user = userEvent.setup();
    const handlePlayClick = vi.fn();

    render(
      <VideoMessageCard
        content={createVideoContent({
          alt: "舞台活动视频封面",
          durationLabel: "1:01",
          height: 360,
          width: 640,
        })}
        onPlayClick={handlePlayClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放视频：舞台活动视频封面" }));

    expect(handlePlayClick).toHaveBeenCalledTimes(1);
  });

  it("renders a transfer download button before a video is stored in COS", async () => {
    const user = userEvent.setup();
    const handleDownloadClick = vi.fn();

    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "待转存视频",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          downloadStatus: undefined,
          fileSerialNo: "serial-video-001",
          videoUrl: "",
        }}
        onDownloadClick={handleDownloadClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "下载视频：待转存视频" }));

    expect(handleDownloadClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "播放视频：待转存视频" }))
      .not.toBeInTheDocument();
  });

  it("can hide the download action for videos that need transfer", () => {
    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "聊天记录视频",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          downloadStatus: undefined,
          fileSerialNo: "serial-video-001",
          videoUrl: "",
        }}
        showDownloadAction={false}
      />,
    );

    expect(screen.getByRole("img", { name: "聊天记录视频" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载视频：聊天记录视频" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "播放视频：聊天记录视频" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "视频下载中" }))
      .not.toBeInTheDocument();
  });

  it("renders initial server-side in-progress videos as downloading", () => {
    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "服务端转存中视频",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          downloadStatus: "ing",
          fileSerialNo: "serial-video-001",
          videoUrl: "",
        }}
      />,
    );

    expect(screen.getByRole("status", { name: "视频下载中" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载视频：服务端转存中视频" }))
      .not.toBeInTheDocument();
  });

  it("renders a transfer download button when the stored video URL has expired", async () => {
    const user = userEvent.setup();
    const handleDownloadClick = vi.fn();

    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "已过期视频",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          downloadStatus: "finished",
          fileSerialNo: "serial-video-001",
          fileUrlExpireTime: Date.now() - 1000,
          videoUrl: "https://b5.bokr.com.cn/chat-videos/expired.mp4",
        }}
        onDownloadClick={handleDownloadClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "下载视频：已过期视频" }));

    expect(handleDownloadClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "播放视频：已过期视频" }))
      .not.toBeInTheDocument();
  });

  it("ignores empty video URL expiry values", () => {
    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "未设置过期时间视频",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          downloadStatus: "finished",
          fileSerialNo: "serial-video-001",
          fileUrlExpireTime: 0,
          videoUrl: "https://b5.bokr.com.cn/chat-videos/demo.mp4",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "播放视频：未设置过期时间视频" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载视频：未设置过期时间视频" }))
      .not.toBeInTheDocument();
  });

  it("renders a circular transfer progress state for videos", () => {
    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "转存中视频",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          downloadStatus: "ing",
          fileSerialNo: "serial-video-001",
          videoUrl: "",
        }}
      />,
    );

    expect(screen.getByRole("status", { name: "视频下载中" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "播放视频：转存中视频" }))
      .not.toBeInTheDocument();
  });

  it("opens the video URL when no play handler is provided", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <VideoMessageCard
        content={createVideoContent({
          alt: "舞台活动视频封面",
          durationLabel: "1:01",
          height: 360,
          width: 640,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放视频：舞台活动视频封面" }));

    expect(openSpy).toHaveBeenCalledWith("/videos/demo.mp4", "_blank", "noopener,noreferrer");
  });

  it("does not render a play control for unsafe video URLs", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "舞台活动视频封面",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          videoUrl: "javascript:alert(1)",
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "播放视频：舞台活动视频封面" }))
      .not.toBeInTheDocument();

    expect(openSpy).not.toHaveBeenCalled();
  });

  it("falls back to default frame dimensions for invalid video sizes", () => {
    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "无效尺寸视频封面",
            durationLabel: "1:01",
            height: Number.NaN,
            width: 0,
          }),
        }}
      />,
    );

    const cover = screen.getByRole("img", { name: "无效尺寸视频封面" });
    const frame = cover.parentElement;

    expect(frame).toHaveStyle({
      aspectRatio: "300 / 225",
      maxWidth: "100%",
      width: "300px",
    });
    expect(cover).toHaveClass("h-full", "w-full");
  });

  it("uses loaded cover dimensions when message video dimensions are invalid", () => {
    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "自然尺寸视频封面",
            durationLabel: "1:01",
            height: Number.NaN,
            width: 0,
          }),
        }}
      />,
    );

    const cover = screen.getByRole("img", { name: "自然尺寸视频封面" }) as HTMLImageElement;
    const frame = cover.parentElement;

    expect(frame).toHaveStyle({
      aspectRatio: "300 / 225",
      width: "300px",
    });

    Object.defineProperty(cover, "naturalWidth", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(cover, "naturalHeight", {
      configurable: true,
      value: 640,
    });
    fireEvent.load(cover);

    expect(frame).toHaveStyle({
      aspectRatio: "202.5 / 360",
      width: "202.5px",
    });
  });

  it("does not render an empty duration badge", () => {
    render(
      <VideoMessageCard
        content={createVideoContent({
          alt: "舞台活动视频封面",
          durationLabel: "",
          height: 360,
          width: 640,
        })}
      />,
    );

    expect(screen.queryByTestId("video-duration")).not.toBeInTheDocument();
  });

  it("renders a fallback frame when the video cover image URL is empty", () => {
    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "空封面视频",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          coverImageUrl: "   ",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "视频封面不可用：空封面视频" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "空封面视频" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放视频：空封面视频" })).toBeInTheDocument();
    expect(screen.getByText("1:01")).toBeInTheDocument();
  });

  it("renders a fallback frame when the video cover image URL is missing", () => {
    render(
      <VideoMessageCard
        content={{
          ...createVideoContent({
            alt: "缺少封面字段视频",
            durationLabel: "1:01",
            height: 360,
            width: 640,
          }),
          coverImageUrl: undefined,
        } as unknown as VideoMessageContent}
      />,
    );

    expect(screen.getByRole("img", { name: "视频封面不可用：缺少封面字段视频" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "缺少封面字段视频" })).not.toBeInTheDocument();
  });

  it("renders a fallback frame when the video cover image fails to load", () => {
    render(
      <VideoMessageCard
        content={createVideoContent({
          alt: "加载失败视频封面",
          durationLabel: "1:01",
          height: 360,
          width: 640,
        })}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "加载失败视频封面" }));

    expect(screen.getByRole("img", { name: "视频封面不可用：加载失败视频封面" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("video-cover-fallback")).toHaveClass("h-[120px]", "w-[120px]");
    expect(screen.queryByRole("img", { name: "加载失败视频封面" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放视频：加载失败视频封面" })).toBeInTheDocument();
    expect(screen.getByText("1:01")).toBeInTheDocument();
  });
});

function createVideoMessage({
  alt,
  durationLabel,
  height,
  width,
}: {
  alt: string;
  durationLabel: string;
  height: number;
  width: number;
}): ChatMessage {
  return {
    id: `msg-video-${width}-${height}`,
    conversationId: "conv-video",
    role: "customer",
    author: "陈慧燕",
    sender: {
      id: "sender-video",
      name: "陈慧燕",
    },
    content: createVideoContent({
      alt,
      durationLabel,
      height,
      width,
    }),
    sentAt: "2026-04-19 10:12:00",
    status: "sent",
  };
}

function createVideoContent({
  alt,
  durationLabel,
  height,
  width,
}: {
  alt: string;
  durationLabel: string;
  height: number;
  width: number;
}): VideoMessageContent {
  return {
    type: "video",
    alt,
    coverImageUrl: "/covers/stage.jpg",
    durationLabel,
    height,
    videoUrl: "/videos/demo.mp4",
    width,
  };
}
