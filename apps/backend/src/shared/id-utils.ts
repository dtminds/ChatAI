type PositiveIdLike = number | string | bigint;

export function uniquePositiveNumbers(values: Array<number | undefined>) {
  return Array.from(
    new Set(
      values.filter((value): value is number =>
        typeof value === "number" && Number.isSafeInteger(value) && value > 0,
      ),
    ),
  );
}

export function uniquePositiveIdStrings(values: Array<PositiveIdLike | null | undefined>) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const normalizedValue = normalizePositiveIdText(value);

    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    uniqueValues.push(normalizedValue);
  }

  return uniqueValues;
}

export function comparePositiveIdValues(
  left: PositiveIdLike | null | undefined,
  right: PositiveIdLike | null | undefined,
) {
  const leftValue = normalizePositiveIdText(left);
  const rightValue = normalizePositiveIdText(right);

  if (leftValue === rightValue) {
    return 0;
  }

  if (leftValue == null) {
    return -1;
  }

  if (rightValue == null) {
    return 1;
  }

  const leftBigInt = BigInt(leftValue);
  const rightBigInt = BigInt(rightValue);

  return leftBigInt < rightBigInt ? -1 : 1;
}

function normalizePositiveIdText(value: PositiveIdLike | null | undefined) {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  }

  if (typeof value === "bigint") {
    return value > 0n ? value.toString() : undefined;
  }

  const trimmedValue = value.trim();

  return /^[1-9]\d*$/.test(trimmedValue) ? trimmedValue : undefined;
}
