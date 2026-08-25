import { Blobatar } from "@blobatar/react";
import type { Animate } from "blobatar";
import "blobatar/motion.css";

import { cn } from "@/lib/utils";

export function AgentAvatar({
  agentId,
  agentName,
  className,
  size = 32,
  animate = "hover",
}: {
  agentId: string;
  agentName: string;
  className?: string;
  size?: number;
  animate?: Animate;
}) {
  const stableAgentId = resolveAgentAvatarIdentity(agentId);

  return (
    <Blobatar
      animate={animate}
      traits={{
        shape: [0.11, 0.35, 0.54, 0.745, 0.888, 0.933, 0.965, 0.99],
        "body.r": 0.999,
      }}
      className={cn("shrink-0", className)}
      name={stableAgentId}
      size={size}
    />
  );
}

export function resolveAgentAvatarIdentity(agentId: string) {
  return agentId.trim() || "draft";
}
