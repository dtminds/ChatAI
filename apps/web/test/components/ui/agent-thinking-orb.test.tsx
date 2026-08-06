import type { ComponentProps } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentThinkingOrb } from "@/components/ui/agent-thinking-orb";

type MockThinkingOrbProps = ComponentProps<"canvas"> & {
  size?: number;
  speed?: number;
  state?: string;
  theme?: string;
};

vi.mock("thinking-orbs", () => ({
  ThinkingOrb: ({ size, speed, state, theme, ...props }: MockThinkingOrbProps) => (
    <canvas
      data-orb-size={size}
      data-orb-speed={speed}
      data-orb-state={state}
      data-orb-theme={theme}
      {...props}
    />
  ),
}));

describe("AgentThinkingOrb", () => {
  it("uses the tuned inline working preset as a decorative status visual", () => {
    const { container } = render(<AgentThinkingOrb speed={1.2} />);
    const orb = container.querySelector('[data-slot="agent-thinking-orb"]');

    expect(orb).toHaveAttribute("aria-hidden", "true");
    expect(orb).toHaveAttribute("data-orb-size", "20");
    expect(orb).toHaveAttribute("data-orb-speed", "1.2");
    expect(orb).toHaveAttribute("data-orb-state", "working");
    expect(orb).toHaveAttribute("data-orb-theme", "auto");
  });

  it.each(["breathing", "connecting"] as const)(
    "supports the %s preset for agent hosting states",
    (state) => {
      const { container } = render(<AgentThinkingOrb state={state} />);

      expect(
        container.querySelector('[data-slot="agent-thinking-orb"]'),
      ).toHaveAttribute("data-orb-state", state);
    },
  );
});
