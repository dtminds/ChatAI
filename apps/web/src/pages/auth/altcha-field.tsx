import {
  type Challenge,
  scrypt,
  solveChallenge,
  type Solution,
} from "altcha/lib";
import {
  type ButtonHTMLAttributes,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { http } from "@/lib/request";
import { cn } from "@/lib/utils";

const CHALLENGE_API_PATH = "/auth/altcha/challenge";
const SOLVE_TIMEOUT_MS = 15000;

const SecureAltchaField = lazy(() =>
  import("./secure-altcha-field").then((module) => ({
    default: module.SecureAltchaField,
  })),
);

type AltchaFieldState = "idle" | "verifying" | "verified" | "error";

type AltchaFieldProps = {
  refreshKey?: number;
};

export function AltchaField({ refreshKey = 0 }: AltchaFieldProps) {
  if (isSecureContext) {
    return (
      <Suspense fallback={<AltchaWidgetFallback />}>
        <SecureAltchaField refreshKey={refreshKey} />
      </Suspense>
    );
  }

  return <HttpAltchaField refreshKey={refreshKey} />;
}

function AltchaWidgetFallback() {
  return (
    <div
      aria-live="polite"
      className="rounded-md border border-input bg-background px-3 py-3 text-sm text-muted-foreground"
      role="status"
    >
      正在加载人机验证
    </div>
  );
}

function HttpAltchaField({ refreshKey }: Required<AltchaFieldProps>) {
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
        timeout: SOLVE_TIMEOUT_MS,
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

  useEffect(() => {
    if (refreshKey === 0) {
      return;
    }

    void verify();
  }, [refreshKey, verify]);

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
