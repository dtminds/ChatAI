export function parseMySqlId(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeIdList(values: string[]) {
  const normalizedValues = values.map(parseMySqlId);

  if (normalizedValues.some((value) => value == null)) {
    return null;
  }

  return Array.from(new Set(normalizedValues as number[]));
}
