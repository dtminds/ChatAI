import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ContactCardMessageContent } from "@/pages/chat/chat-types";
import { ContactCardMessageCard } from "@/pages/chat/components/message";

describe("ContactCardMessageCard", () => {
  it("renders contact card messages with company, name, avatar and source label", () => {
    render(
      <ContactCardMessageCard
        content={
          {
            avatarUrl: "http://wx.qlogo.cn/mmhead/avatar/0",
            company: "微信",
            contactSerialNo: "D91D072C07D9CECFEC1271DB430B5EDF5194F219CF554649F1C4F9C615435A82",
            groupSerialNo: "29F71A2ED8125854B6AA6EB6E582A8A9330A4B02FE42E908C5EF07B05A8F6A33",
            name: "binarywang",
            sourceLabel: "个人名片",
            type: "contact-card",
          } satisfies ContactCardMessageContent
        }
      />,
    );

    expect(screen.getByText("微信")).toBeInTheDocument();
    expect(screen.getByText("binarywang")).toBeInTheDocument();
    expect(screen.getByText("个人名片")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "binarywang" })).toHaveAttribute(
      "src",
      "http://wx.qlogo.cn/mmhead/avatar/64",
    );
    expect(screen.getByTestId("contact-card-avatar-frame")).toHaveStyle({
      height: "48px",
      width: "48px",
    });
  });
});
