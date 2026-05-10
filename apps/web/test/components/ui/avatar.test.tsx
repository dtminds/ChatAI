import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
});
