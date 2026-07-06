import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SphFeedMessageContent } from "@/pages/chat/chat-types";
import { SphFeedMessageCard } from "@/pages/chat/components/message";

describe("SphFeedMessageCard", () => {
  it("renders video channel feed cards without a play button", () => {
    render(
      <SphFeedMessageCard
        content={
          {
            description: "杭州高架惊现鸵鸟飞奔，交警及时赶到引导带路，原来它是离家出走#鸵鸟",
            imageUrl: "https://finder.video.qq.com/cover.jpg",
            sourceLabel: "视频号",
            title: "都市快报",
            type: "sphfeed",
            url: "https://channels.weixin.qq.com/web/pages/feed?eid=export%2FUzFfBgAAxPiD",
          } satisfies SphFeedMessageContent
        }
      />,
    );

    const link = screen.getByRole("link", { name: /都市快报/ });

    expect(screen.getByTestId("sphfeed-overlay")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "都市快报" })).toHaveAttribute(
      "src",
      "https://finder.video.qq.com/cover.jpg",
    );
    expect(screen.getByText("都市快报")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /播放/ })).not.toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      "https://channels.weixin.qq.com/web/pages/feed?eid=export%2FUzFfBgAAxPiD",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
