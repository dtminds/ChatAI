import type { ComponentPropsWithoutRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

vi.mock("@radix-ui/react-avatar", () => ({
  Root: ({ children, ...props }: ComponentPropsWithoutRef<"span">) => (
    <span {...props}>{children}</span>
  ),
  Image: (props: ComponentPropsWithoutRef<"img">) => <img {...props} />,
  Fallback: ({ children, ...props }: ComponentPropsWithoutRef<"span">) => (
    <span {...props}>{children}</span>
  ),
}));

describe("Avatar", () => {
  it("uses a user icon by default for customer avatars", () => {
    render(
      <Avatar>
        <AvatarFallback aria-label="默认头像" />
      </Avatar>,
    );

    expect(screen.getByLabelText("默认头像")).toHaveClass(
      "bg-primary/15",
      "text-primary",
    );
    expect(screen.getByLabelText("默认头像").querySelector("svg")).toBeInTheDocument();
    expect(screen.getByLabelText("默认头像")).not.toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    );
  });

  it("shows initials when fallback children are provided", () => {
    render(
      <Avatar>
        <AvatarFallback>客</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByText("客")).toBeInTheDocument();
    expect(screen.getByText("客").querySelector("svg")).not.toBeInTheDocument();
  });

  it("normalizes avatar image URLs before rendering", () => {
    render(
      <Avatar>
        <AvatarImage alt="企微头像" src="https://wework.qpic.cn/wwpic/abc/0" />
      </Avatar>,
    );

    expect(screen.getByAltText("企微头像")).toHaveAttribute(
      "src",
      "https://wework.qpic.cn/wwpic/abc/60",
    );
  });
});
