import { useLayoutEffect } from "react";
import { subscribeAppearancePreferences } from "@/store/appearance-store";

export function useAppearancePreferences() {
  useLayoutEffect(() => subscribeAppearancePreferences(), []);
}
