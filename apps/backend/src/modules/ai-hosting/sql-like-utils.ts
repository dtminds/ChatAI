export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function buildContainsLikePattern(value: string) {
  return `%${escapeLikePattern(value)}%`;
}
