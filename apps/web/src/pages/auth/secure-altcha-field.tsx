import type { AltchaWidgetElement } from "altcha";
import ScryptWorker from "altcha/workers/scrypt?worker";
import { useEffect, useRef } from "react";
import "altcha";
import "altcha/i18n/zh-cn";
import "altcha/themes/business.css";

const CHALLENGE_URL = "/api/auth/altcha/challenge";
const WIDGET_CONFIGURATION = JSON.stringify({
  hideFooter: true,
  hideLogo: true,
});

type SecureAltchaFieldProps = {
  refreshKey: number;
};

declare global {
  interface Window {
    $altcha?: {
      algorithms?: Map<string, () => Worker>;
    };
  }
}

export function SecureAltchaField({ refreshKey }: SecureAltchaFieldProps) {
  const widgetRef = useRef<AltchaWidgetElement>(null);

  useEffect(() => {
    ensureScryptWorker();
  }, []);

  useEffect(() => {
    const widget = widgetRef.current;

    if (!widget || refreshKey === 0) {
      return;
    }

    widget.reset();
    void widget.verify();
  }, [refreshKey]);

  return (
    <div className="[&>altcha-widget]:block [&>altcha-widget]:w-full text-[13px]">
      <altcha-widget
        auto="onload"
        challenge={CHALLENGE_URL}
        configuration={WIDGET_CONFIGURATION}
        data-altcha-theme="business"
        language="zh-cn"
        name="altcha"
        ref={widgetRef}
        style={{ "--altcha-max-width": "100%" }}
      />
    </div>
  );
}

function ensureScryptWorker() {
  window.$altcha?.algorithms?.set("SCRYPT", () => new ScryptWorker());
}
