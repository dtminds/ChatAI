export function raceAbort<T>(operation: Promise<T>, signal: AbortSignal, message: string) {
  if (signal.aborted) return Promise.reject(new Error(message));
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error(message));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([operation, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  });
}
