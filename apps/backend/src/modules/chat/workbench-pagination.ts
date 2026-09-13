export function normalizeWorkbenchPage(value: number | undefined) {
  return Number.isSafeInteger(value) && value != null && value > 0 ? value : 1;
}

export function normalizeWorkbenchPageSize(value: number | undefined) {
  if (!Number.isSafeInteger(value) || value == null || value <= 0) {
    return 100;
  }

  return Math.min(value, 100);
}
