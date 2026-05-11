import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LocationMessageContent } from "@/pages/chat/chat-types";
import { LocationMessageCard } from "@/pages/chat/components/message";

describe("LocationMessageCard", () => {
  it("renders location messages and links to an Amap marker page", () => {
    render(
      <LocationMessageCard
        content={
          {
            address: "浙江省杭州市钱塘区学府街515号智慧谷一栋",
            latitude: 30.310369,
            longitude: 120.371184,
            title: "杭州智慧谷移动互联网大厦",
            type: "location",
            zoom: 15,
          } satisfies LocationMessageContent
        }
      />,
    );

    const link = screen.getByRole("link", { name: /杭州智慧谷移动互联网大厦/ });

    expect(screen.getByText("杭州智慧谷移动互联网大厦")).toBeInTheDocument();
    expect(screen.getByText("浙江省杭州市钱塘区学府街515号智慧谷一栋")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /杭州智慧谷移动互联网大厦/ })).toHaveStyle({
      height: "82px",
      width: "303px",
    });
    expect(screen.getByTestId("location-map")).toHaveStyle({
      backgroundImage: "url(\"https://b5.bokr.com.cn/dist/location_bg.png\")",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://uri.amap.com/marker?position=120.371184%2C30.310369&name=%E6%9D%AD%E5%B7%9E%E6%99%BA%E6%85%A7%E8%B0%B7%E7%A7%BB%E5%8A%A8%E4%BA%92%E8%81%94%E7%BD%91%E5%A4%A7%E5%8E%A6&callnative=0",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not link when coordinates are invalid", () => {
    render(
      <LocationMessageCard
        content={{
          address: "无效地址",
          latitude: Number.NaN,
          longitude: 120.371184,
          title: "无效位置",
          type: "location",
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: /无效位置/ })).not.toBeInTheDocument();
    expect(screen.getByText("无效位置")).toBeInTheDocument();
  });
});
