import { palettes, type ShapeId } from "@oreo-design/avatar";
import { Avatar as OreoAvatar } from "@oreo-design/avatar/react";

import { cn } from "@/lib/utils";

const agentAvatarShapes = ["nova", "flare", "void"] as const satisfies readonly ShapeId[];

export function AgentAvatar({
  agentId,
  agentName,
  className,
  size = 24,
}: {
  agentId: string;
  agentName: string;
  className?: string;
  size?: number;
}) {
  const stableAgentId = agentId.trim() || "draft";
  const recipe = resolveAgentAvatarRecipe(stableAgentId);

  return (
    <OreoAvatar
      appearance="dark"
      background={null}
      className={cn("shrink-0", className)}
      drift={8}
      tone={{ chroma: 0.88 }}
      palette={recipe.palette}
      shape={recipe.shape}
      size={size}
      title={`${agentName.trim() || "Agent"}头像`}
      variantId={`agent:${stableAgentId}`}
    />
  );
}

export function resolveAgentAvatarRecipe(agentId: string) {
  const stableAgentId = agentId.trim() || "draft";
  const shapeIndex =
    hashIdentity(`shape:${stableAgentId}`) % agentAvatarShapes.length;
  const paletteIndex =
    hashIdentity(`palette:${stableAgentId}`) % palettes.length;

  return {
    palette: palettes[paletteIndex].id,
    shape: agentAvatarShapes[shapeIndex],
  };
}

function hashIdentity(value: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}
