import type { BlobatarProps } from "@blobatar/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mad } from "blobatar/expression";

import {
  AgentAvatar,
  resolveAgentAvatarIdentity,
} from "@/pages/chat/ai-hosting/agent-avatar";

vi.mock("@blobatar/react", () => ({
  Blobatar: ({ animate, expression, name, size }: BlobatarProps) => (
    <output
      data-animate={animate}
      data-expression={expression === mad ? "mad" : expression ? "active" : "idle"}
      data-name={name}
      data-size={size}
      data-testid="blobatar"
    />
  ),
}));

describe("AgentAvatar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("uses the stable agent id and hover animation by default", () => {
    render(
      <>
        <AgentAvatar agentId="301" />
        <AgentAvatar agentId="301" />
        <AgentAvatar agentId="302" />
      </>,
    );

    expect(screen.getAllByTestId("blobatar")).toEqual([
      expect.objectContaining({ dataset: expect.objectContaining({ animate: "hover", name: "301" }) }),
      expect.objectContaining({ dataset: expect.objectContaining({ animate: "hover", name: "301" }) }),
      expect.objectContaining({ dataset: expect.objectContaining({ animate: "hover", name: "302" }) }),
    ]);
  });

  it("reserves a draft identity before creation", () => {
    expect(resolveAgentAvatarIdentity(" 301 ")).toBe("301");
    expect(resolveAgentAvatarIdentity("  ")).toBe("draft");
  });

  it("temporarily uses an always animation for a click reaction", () => {
    vi.useFakeTimers();
    render(<AgentAvatar agentId="301" interaction="reaction" />);

    const avatar = screen.getByTestId("blobatar");

    expect(avatar).toHaveAttribute("data-animate", "hover");
    expect(avatar).toHaveAttribute("data-expression", "idle");

    fireEvent.click(screen.getByRole("button", { name: "切换 Agent 表情" }));

    expect(avatar).toHaveAttribute("data-animate", "always");
    expect(avatar).toHaveAttribute("data-expression", "active");

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(avatar).toHaveAttribute("data-animate", "hover");
    expect(avatar).toHaveAttribute("data-expression", "idle");
  });

  it("gives live avatars low-frequency friendly expressions", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<AgentAvatar agentId="301" interaction="live" />);

    const avatar = screen.getByTestId("blobatar");

    expect(avatar).toHaveAttribute("data-animate", "always");
    expect(avatar).toHaveAttribute("data-expression", "idle");

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(avatar).toHaveAttribute("data-expression", "active");

    act(() => {
      vi.advanceTimersByTime(1_800);
    });

    expect(avatar).toHaveAttribute("data-expression", "idle");
  });

  it("lets live avatars use a full-range click reaction", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.2);
    render(<AgentAvatar agentId="301" interaction="live" />);

    const avatar = screen.getByTestId("blobatar");

    fireEvent.click(screen.getByRole("button", { name: "切换 Agent 表情" }));

    expect(avatar).toHaveAttribute("data-animate", "always");
    expect(avatar).toHaveAttribute("data-expression", "mad");

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(avatar).toHaveAttribute("data-animate", "always");
    expect(avatar).toHaveAttribute("data-expression", "idle");
  });
});
