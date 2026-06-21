export function isValidMessageSeq(seq: number | undefined): seq is number {
  return typeof seq === "number" && Number.isSafeInteger(seq) && seq > 0;
}
