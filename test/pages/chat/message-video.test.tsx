import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { MessageContentRenderer } from "@/pages/chat/components/message";

describe("MessageContentRenderer video messages", () => {
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
    expect(screen.getByRole("button", { name: "播放视频：舞台活动视频封面" })).toBeInTheDocument();
    expect(screen.getByText("1:01")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "播放视频：湖面竖版视频封面" })).toBeInTheDocument();
    expect(screen.getByText("0:11")).toBeInTheDocument();
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
}) {
  return {
    id: `msg-video-${width}-${height}`,
    conversationId: "conv-video",
    role: "customer",
    author: "陈慧燕",
    sender: {
      id: "sender-video",
      name: "陈慧燕",
    },
    content: {
      type: "video",
      alt,
      coverImageUrl: "/covers/stage.jpg",
      durationLabel,
      height,
      videoUrl: "/videos/demo.mp4",
      width,
    },
    sentAt: "2026-04-19 10:12:00",
    status: "read",
  } as ChatMessage;
}
