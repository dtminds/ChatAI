export function readBooleanFlag(
  value: number | string | boolean | null | undefined,
) {
  return value === true || Number(value ?? 0) === 1;
}
