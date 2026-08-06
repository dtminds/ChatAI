import { ThinkingOrb, type OrbState } from "thinking-orbs";

import { cn } from "@/lib/utils";

export interface AgentThinkingOrbProps {
  className?: string;
  speed?: number;
  state?: Extract<OrbState, "breathing" | "connecting" | "working">;
}

export function AgentThinkingOrb({
  className,
  speed = 1,
  state = "working",
}: AgentThinkingOrbProps) {
  return (
    <ThinkingOrb
      aria-hidden="true"
      className={cn("shrink-0 opacity-70", className)}
      data-slot="agent-thinking-orb"
      size={20}
      speed={speed}
      state={state}
      theme="auto"
    />
  );
}
