import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AgentAvatar,
  resolveAgentAvatarRecipe,
} from "@/pages/chat/ai-hosting/agent-avatar";
import { useAppearanceStore } from "@/store/appearance-store";

describe("AgentAvatar", () => {
  beforeEach(() => {
    useAppearanceStore.setState({
      isSystemDarkMode: false,
      themePreference: "light",
    });
  });

  afterEach(() => {
    useAppearanceStore.setState({
      isSystemDarkMode: false,
      themePreference: "system",
    });
  });

  it("keeps the generated identity stable across renames and varies it by agent id", () => {
    const { container } = render(
      <>
        <AgentAvatar agentId="301" agentName="护肤小助理" />
        <AgentAvatar agentId="301" agentName="护肤顾问" />
        <AgentAvatar agentId="302" agentName="售后小助理" />
      </>,
    );

    expect(screen.getByRole("img", { name: "护肤小助理头像" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "护肤顾问头像" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "售后小助理头像" })).toBeInTheDocument();

    const avatars = Array.from(container.querySelectorAll("svg"));

    expect(avatars).toHaveLength(3);
    expect(getVisualMarkup(avatars[0])).toBe(getVisualMarkup(avatars[1]));
    expect(getVisualMarkup(avatars[0])).not.toBe(getVisualMarkup(avatars[2]));
  });

  it("selects shape and palette independently from a stable agent id", () => {
    const firstRecipe = resolveAgentAvatarRecipe("301");
    const repeatedRecipe = resolveAgentAvatarRecipe("301");

    expect(["nova", "flare", "void"]).toContain(firstRecipe.shape);
    expect(firstRecipe).toEqual(repeatedRecipe);
    expect(firstRecipe.palette).toBeTruthy();
  });

  it("keeps the identity colors stable across appearance modes", () => {
    const { container } = render(
      <AgentAvatar agentId="301" agentName="护肤小助理" />,
    );
    const lightMarkup = getAvatarVisualMarkup(container);

    act(() => {
      useAppearanceStore.setState({ themePreference: "dark" });
    });

    expect(getAvatarVisualMarkup(container)).toBe(lightMarkup);

    act(() => {
      useAppearanceStore.setState({
        isSystemDarkMode: false,
        themePreference: "system",
      });
    });

    expect(getAvatarVisualMarkup(container)).toBe(lightMarkup);

    act(() => {
      useAppearanceStore.setState({ isSystemDarkMode: true });
    });

    expect(getAvatarVisualMarkup(container)).toBe(lightMarkup);
  });
});

function getVisualMarkup(avatar: SVGSVGElement) {
  const clone = avatar.cloneNode(true) as SVGSVGElement;

  clone.querySelector("title")?.remove();

  return clone.innerHTML;
}

function getAvatarVisualMarkup(container: HTMLElement) {
  const avatar = container.querySelector("svg");

  expect(avatar).not.toBeNull();

  return getVisualMarkup(avatar as SVGSVGElement);
}
