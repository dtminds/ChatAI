import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RedPacketMessageContent } from "@/pages/chat/chat-types";
import { RedPacketMessageCard } from "@/pages/chat/components/message";

describe("RedPacketMessageCard", () => {
  it("renders red packet title, amount, and description without showing the count", () => {
    render(
      <RedPacketMessageCard
        content={
          {
            description: "来自哼╭(╯^╰)╮的红包，请进入手机版企业微信领取",
            title: "恭喜发财，大吉大利",
            totalAmount: 2,
            totalCnt: 1,
            type: "redpacket",
          } satisfies RedPacketMessageContent
        }
      />,
    );

    expect(screen.getByText("恭喜发财，大吉大利")).toBeInTheDocument();
    expect(screen.getByText("¥0.02")).toBeInTheDocument();
    expect(
      screen.getByText("来自哼╭(╯^╰)╮的红包，请进入手机版企业微信领取"),
    ).toBeInTheDocument();
    expect(screen.queryByText("1个")).not.toBeInTheDocument();
    expect(screen.getByTestId("redpacket-message-card")).toHaveAccessibleName(
      "红包：恭喜发财，大吉大利，¥0.02",
    );
  });
});
