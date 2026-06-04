export function useIsDevEnv(): boolean {
  return import.meta.env.DEV;
}
