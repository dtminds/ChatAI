import { useEffect, useRef, useState } from "react";
import { Blobatar } from "@blobatar/react";
import {
  happy,
  love,
  mad,
  sad,
  scared,
  shy,
  sick,
  sleepy,
  smug,
  surprised,
  thinking,
  unsure,
  wink,
  type Expression,
} from "blobatar/expression";
import "blobatar/motion.css";

import { cn } from "@/lib/utils";

const reactionExpressions = [
  happy,
  sad,
  mad,
  surprised,
  wink,
  sleepy,
  smug,
  unsure,
  scared,
  love,
  shy,
  sick,
  thinking,
] as const;

const liveExpressions = [
  happy,
  surprised,
  wink,
  sleepy,
  smug,
  unsure,
  love,
  shy,
  thinking,
] as const;
const reactionDurationMs = 1_500;
const liveExpressionDurationMs = 1_800;
const liveIntervalMinMs = 12_000;
const liveIntervalMaxMs = 22_000;

export type AgentAvatarInteraction = "none" | "reaction" | "live";

export function AgentAvatar({
  agentId,
  className,
  size = 32,
  interaction = "none",
}: {
  agentId: string;
  className?: string;
  size?: number;
  interaction?: AgentAvatarInteraction;
}) {
  const stableAgentId = resolveAgentAvatarIdentity(agentId);
  const [reactionExpression, setReactionExpression] = useState<Expression>();
  const [liveExpression, setLiveExpression] = useState<Expression>();
  const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      clearTimeout(reactionTimeoutRef.current ?? undefined);
      reactionTimeoutRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (interaction === "none") {
      clearTimeout(reactionTimeoutRef.current ?? undefined);
      reactionTimeoutRef.current = null;
      setReactionExpression(undefined);
    }
  }, [interaction]);

  useEffect(() => {
    if (interaction !== "live") {
      setLiveExpression(undefined);
      return;
    }

    let expressionTimeout: ReturnType<typeof setTimeout> | null = null;
    let nextExpressionTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextExpression = () => {
      nextExpressionTimeout = setTimeout(() => {
        setLiveExpression(pickExpression(liveExpressions));
        expressionTimeout = setTimeout(() => {
          setLiveExpression(undefined);
          scheduleNextExpression();
        }, liveExpressionDurationMs);
      }, randomBetween(liveIntervalMinMs, liveIntervalMaxMs));
    };

    scheduleNextExpression();

    return () => {
      clearTimeout(expressionTimeout ?? undefined);
      clearTimeout(nextExpressionTimeout ?? undefined);
    };
  }, [interaction]);

  const isReacting = reactionExpression !== undefined;
  const expression = reactionExpression ?? liveExpression;
  const avatar = (
    <Blobatar
      animate={interaction === "live" || isReacting ? "always" : "hover"}
      expression={expression}
      traits={{
        shape: [0.11, 0.35, 0.54, 0.745, 0.888, 0.933, 0.965, 0.99],
        "body.r": 0.999,
      }}
      className={cn("shrink-0", className)}
      name={stableAgentId}
      size={size}
    />
  );

  if (interaction === "reaction" || interaction === "live") {
    return (
      <button
        aria-label="切换 Agent 表情"
        className="inline-flex shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => {
          setReactionExpression((current) =>
            pickExpression(reactionExpressions, current ?? liveExpression),
          );
          clearTimeout(reactionTimeoutRef.current ?? undefined);
          reactionTimeoutRef.current = setTimeout(() => {
            setReactionExpression(undefined);
            reactionTimeoutRef.current = null;
          }, reactionDurationMs);
        }}
        type="button"
      >
        {avatar}
      </button>
    );
  }

  return avatar;
}

export function resolveAgentAvatarIdentity(agentId: string) {
  return agentId.trim() || "draft";
}

function pickExpression<T extends Expression>(expressions: readonly T[], current?: Expression) {
  const choices = current
    ? expressions.filter((expression) => expression !== current)
    : expressions;

  return choices[Math.floor(Math.random() * choices.length)]!;
}

function randomBetween(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
