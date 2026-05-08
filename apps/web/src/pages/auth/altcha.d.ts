import type { WidgetAttributes } from "altcha";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "altcha-widget": WidgetAttributes;
    }
  }
}
