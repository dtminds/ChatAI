export const DEFAULT_ACCOUNT_RAIL_WIDTH = 216;
export const MIN_ACCOUNT_RAIL_WIDTH = 216;
export const MAX_ACCOUNT_RAIL_WIDTH = 320;

export function clampAccountRailWidth(width: number) {
  if (!Number.isFinite(width)) {
    return DEFAULT_ACCOUNT_RAIL_WIDTH;
  }

  return Math.min(Math.max(width, MIN_ACCOUNT_RAIL_WIDTH), MAX_ACCOUNT_RAIL_WIDTH);
}
