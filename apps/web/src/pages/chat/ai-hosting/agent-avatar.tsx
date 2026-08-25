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
      className={cn("shrink-0", className)}
      name={stableAgentId}
      size={size}
      title={`${agentName.trim() || "Agent"}头像`}
    />
  );
}

export function resolveAgentAvatarIdentity(agentId: string) {
  return agentId.trim() || "draft";
}
