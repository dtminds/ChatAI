import {
  type Challenge,
  scrypt,
  solveChallenge,
  type Solution,
} from "altcha/lib";
import ScryptWorker from "altcha/workers/scrypt?worker";
import {
  type ButtonHTMLAttributes,
  useCallback,
  useState,
} from "react";
import "altcha";
import "altcha/i18n/zh-cn";
import { Button } from "@/components/ui/button";
import { http } from "@/lib/request";
import { cn } from "@/lib/utils";

const CHALLENGE_URL = "/api/auth/altcha/challenge";
const CHALLENGE_API_PATH = "/auth/altcha/challenge";

type AltchaFieldState = "idle" | "verifying" | "verified" | "error";

declare global {
  interface Window {
    $altcha?: {
      algorithms?: Map<string, () => Worker>;
    };
  }
}

export function AltchaField() {
  ensureScryptWorker();

  if (isSecureContext) {
    return (
      <altcha-widget
        auto="onload"
        challenge={CHALLENGE_URL}
        language="zh-cn"
        name="altcha"
      />
    );
  }

  return <HttpAltchaField />;
}

function ensureScryptWorker() {
  window.$altcha?.algorithms?.set("SCRYPT", () => new ScryptWorker());
}

function HttpAltchaField() {
  const [payload, setPayload] = useState("");
  const [state, setState] = useState<AltchaFieldState>("idle");

  const verify = useCallback(async () => {
    setPayload("");
    setState("verifying");

    try {
      const challenge = await fetchAltchaChallenge();
      const solution = await solveChallenge({
        challenge,
        deriveKey: scrypt.deriveKey,
        timeout: 90000,
      });

      if (!solution) {
        throw new Error("ALTCHA solution timed out.");
      }

      const nextPayload = encodeAltchaPayload(challenge, solution);

      setPayload(nextPayload);
      setState("verified");
    } catch {
      setState("error");
    }
  }, []);

  return (
    <div
      aria-live="polite"
      className={cn(
        "rounded-md border border-input bg-background px-3 py-3 text-sm",
        state === "error" && "border-destructive/60",
      )}
    >
      <input name="altcha" required type="hidden" value={payload} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{getStatusText(state)}</span>
        <AltchaButton disabled={state === "verifying"} onClick={verify} />
      </div>
    </div>
  );
}

function AltchaButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      className="h-8 rounded-md px-3"
      size="sm"
      type="button"
      variant="outline"
      {...props}
    >
      验证
    </Button>
  );
}

function getStatusText(state: AltchaFieldState) {
  switch (state) {
    case "verifying":
      return "正在进行人机验证";
    case "verified":
      return "人机验证已通过";
    case "error":
      return "人机验证失败，请重试";
    default:
      return "请完成人机验证";
  }
}

async function fetchAltchaChallenge() {
  return http.get<Challenge>(CHALLENGE_API_PATH);
}

function encodeAltchaPayload(challenge: Challenge, solution: Solution) {
  return window.btoa(
    JSON.stringify({
      challenge: {
        parameters: challenge.parameters,
        signature: challenge.signature,
      },
      solution,
    }),
  );
}
