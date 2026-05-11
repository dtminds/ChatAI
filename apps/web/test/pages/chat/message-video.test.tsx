import { render, screen } from "@testing-library/react";
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
      maxHeight: "360px",
      maxWidth: "min(300px, 60%)",
      minWidth: "120px",
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
      maxHeight: "360px",
      maxWidth: "min(300px, 60%)",
      minWidth: "120px",
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

  it("does not open unsafe video URLs", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "播放视频：舞台活动视频封面" }));

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
      maxHeight: "360px",
      maxWidth: "min(300px, 60%)",
      minWidth: "120px",
    });
    expect(cover).toHaveClass("h-auto", "max-h-[360px]", "w-auto", "max-w-full");
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
    status: "read",
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
