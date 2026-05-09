import type { CSSVariables, WidgetAttributes } from "altcha";

type AltchaWidgetAttributes = WidgetAttributes & {
  style?: Partial<CSSVariables>;
  theme?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "altcha-widget": AltchaWidgetAttributes;
    }
  }
}
