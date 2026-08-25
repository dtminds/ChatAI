import type { BlobatarProps } from "@blobatar/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AgentAvatar,
  resolveAgentAvatarIdentity,
} from "@/pages/chat/ai-hosting/agent-avatar";

vi.mock("@blobatar/react", () => ({
  Blobatar: ({ animate, name, size }: BlobatarProps) => (
    <output data-animate={animate} data-name={name} data-size={size} data-testid="blobatar" />
  ),
}));

describe("AgentAvatar", () => {
  it("uses the stable agent id and hover animation by default", () => {
    render(
      <>
        <AgentAvatar agentId="301" agentName="护肤小助理" />
        <AgentAvatar agentId="301" agentName="护肤顾问" />
        <AgentAvatar agentId="302" agentName="售后小助理" />
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
});
