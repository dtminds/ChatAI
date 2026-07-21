import { parseMySqlId } from "../../shared/id-utils.js";

export { parseMySqlId };

export function normalizeIdList(values: string[]) {
  const normalizedValues = values.map(parseMySqlId);

  if (normalizedValues.some((value) => value == null)) {
    return null;
  }

  return Array.from(new Set(normalizedValues as number[]));
}
