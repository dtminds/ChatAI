import { VolumeHighIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import BenzAMRRecorder from "benz-amr-recorder";
import {
  type ComponentProps,
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { blobLooksLikeWav } from "@/lib/blob-wav";
import type { RequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { AltchaField } from "./altcha-field";
import { login } from "./auth-service";
import { storeAuthTokens } from "./auth-tokens";

/** 企业微信语音示例：OSS 上常见 .amr 后缀实际为 Tencent SILK，经后端公开转码接口输出 WAV 后播放 */
const LOGIN_WECOM_VOICE_URL =
  "https://oss.bilinl.com/files/OSS_1598928257320554496/2026/05/13/4384061552988160d6b5de661e.amr";

export function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-4xl">
        <LoginForm />
      </div>
    </main>
  );
}

function LoginForm({ className, ...props }: ComponentProps<"div">) {
  const accountId = useId();
  const passwordId = useId();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const account = String(formData.get("account") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const altcha = String(formData.get("altcha") ?? "");

    if (!altcha) {
      setErrorMessage("请先完成人机验证");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await login({ account, altcha, password });

      storeAuthTokens(response.data);
      navigate("/chat", { replace: true });
    } catch (error) {
      setErrorMessage((error as RequestError).message ?? "登录失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden rounded-xl p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">欢迎回来</h1>
                <p className="text-balance text-muted-foreground">
                  登录你的客服工作台
                </p>
                <LoginWecomVoiceButton />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={accountId}>用户名</Label>
                <Input
                  autoComplete="username"
                  id={accountId}
                  name="account"
                  placeholder="请输入用户名"
                  required
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor={passwordId}>密码</Label>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        className="ml-auto h-auto rounded-none p-0 text-sm underline-offset-2 hover:bg-transparent hover:underline"
                        type="button"
                        variant="ghost"
                      >
                        忘记密码？
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>重置密码</DialogTitle>
                        <DialogDescription>
                          为了保障账号安全，请使用主账号登录，然后在设置中重置子账号的密码
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">关闭</Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                <Input
                  autoComplete="current-password"
                  id={passwordId}
                  name="password"
                  placeholder="请输入密码"
                  required
                  type="password"
                />
              </div>

              <AltchaField />

              {errorMessage ? (
                <p className="text-sm text-destructive" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? "登录中..." : "登录"}
              </Button>
            </div>
          </form>

          <div className="relative hidden bg-muted md:block">
            <img
              alt="登录页占位图"
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
              src="https://ui.shadcn.com/placeholder.svg"
            />
          </div>
        </CardContent>
      </Card>
      <div className="pt-6 text-center text-sm text-muted-foreground">
        点击继续，即表示你同意我们的{" "}
        <a className="underline underline-offset-4 hover:text-primary" href="#">
          服务条款
        </a>{" "}
        和{" "}
        <a className="underline underline-offset-4 hover:text-primary" href="#">
          隐私政策
        </a>
        。
      </div>
    </div>
  );
}

type LoginVoicePlaybackState = "idle" | "loading" | "playing" | "error";

function LoginWecomVoiceButton() {
  const cachedBlobRef = useRef<Blob | null>(null);
  const wavObjectUrlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const amrRecorderRef = useRef<BenzAMRRecorder | null>(null);
  const [state, setState] = useState<LoginVoicePlaybackState>("idle");

  function revokeWavPlaybackUrl() {
    if (wavObjectUrlRef.current) {
      URL.revokeObjectURL(wavObjectUrlRef.current);
      wavObjectUrlRef.current = null;
    }
  }

  function destroyAmrRecorder(recorder: BenzAMRRecorder | null) {
    try {
      recorder?.destroy();
    } catch (error) {
      const isKnownDestroyError =
        error instanceof TypeError &&
        error.message.includes("Cannot set properties of null");

      if (!isKnownDestroyError) {
        throw error;
      }
    }
  }

  function stopPlaybackEngines() {
    audioRef.current?.pause();
    audioRef.current = null;
    revokeWavPlaybackUrl();
    amrRecorderRef.current?.stop();
    destroyAmrRecorder(amrRecorderRef.current);
    amrRecorderRef.current = null;
  }

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;

      if (wavObjectUrlRef.current) {
        URL.revokeObjectURL(wavObjectUrlRef.current);
        wavObjectUrlRef.current = null;
      }

      amrRecorderRef.current?.stop();

      try {
        amrRecorderRef.current?.destroy();
      } catch (error) {
        const isKnownDestroyError =
          error instanceof TypeError &&
          error.message.includes("Cannot set properties of null");

        if (!isKnownDestroyError) {
          throw error;
        }
      }

      amrRecorderRef.current = null;
      cachedBlobRef.current = null;
    };
  }, []);

  async function handleClick() {
    if (state === "playing") {
      stopPlaybackEngines();
      setState("idle");

      return;
    }

    try {
      setState("loading");

      cachedBlobRef.current ??= await fetchLoginDemoVoicePlaybackBlob(
        LOGIN_WECOM_VOICE_URL,
      );
      const blob = cachedBlobRef.current;

      if (await blobLooksLikeWav(blob)) {
        amrRecorderRef.current?.stop();
        destroyAmrRecorder(amrRecorderRef.current);
        amrRecorderRef.current = null;
        audioRef.current?.pause();
        revokeWavPlaybackUrl();
        wavObjectUrlRef.current = URL.createObjectURL(blob);
        const audio = new Audio(wavObjectUrlRef.current);
        audio.addEventListener("ended", () => {
          setState("idle");
        });
        audio.addEventListener("error", () => {
          revokeWavPlaybackUrl();
          setState("error");
        });
        audioRef.current = audio;
        setState("playing");
        await audio.play();

        return;
      }

      audioRef.current?.pause();
      revokeWavPlaybackUrl();
      audioRef.current = null;

      if (!amrRecorderRef.current) {
        amrRecorderRef.current = new BenzAMRRecorder();
        amrRecorderRef.current.onEnded(() => {
          setState("idle");
        });
        amrRecorderRef.current.onStop(() => {
          setState("idle");
        });
      }

      if (!amrRecorderRef.current.isInit()) {
        await amrRecorderRef.current.initWithBlob(blob);
      }

      setState("playing");
      amrRecorderRef.current.play();
    } catch {
      stopPlaybackEngines();
      cachedBlobRef.current = null;
      setState("error");
    }
  }

  let label = "播放企业微信语音";
  if (state === "loading") {
    label = "加载中...";
  } else if (state === "playing") {
    label = "停止播放";
  } else if (state === "error") {
    label = "暂不可播放，点击重试";
  }

  return (
    <Button
      aria-label={
        state === "playing"
          ? "停止播放企业微信语音"
          : "播放企业微信语音消息"
      }
      className="w-full gap-2"
      disabled={state === "loading"}
      onClick={() => void handleClick()}
      type="button"
      variant="outline"
    >
      <HugeiconsIcon
        className="text-foreground"
        icon={VolumeHighIcon}
        size={18}
        strokeWidth={1.9}
      />
      <span>{label}</span>
    </Button>
  );
}

function encodePublicOssMediaUrl(httpsUrl: string): string {
  return `/api/server/public/oss-media?${new URLSearchParams({
    url: httpsUrl,
  }).toString()}`;
}

function encodePublicOssVoicePlayUrl(httpsUrl: string): string {
  return `/api/server/public/oss-media/play?${new URLSearchParams({
    url: httpsUrl,
  }).toString()}`;
}

const MIN_LOGIN_VOICE_BYTES = 100;

async function fetchLoginDemoVoicePlaybackBlob(httpsUrl: string): Promise<Blob> {
  const parsed = new URL(httpsUrl);
  const attempts: Array<() => Promise<Response>> = [
    () =>
      fetch(encodePublicOssVoicePlayUrl(httpsUrl), {
        credentials: "omit",
        headers: { Accept: "audio/wav,*/*" },
      }),
  ];

  if (import.meta.env.DEV) {
    attempts.push(() =>
      fetch(`/__chatai-dev-media${parsed.pathname}${parsed.search}`, {
        credentials: "omit",
      }),
    );
  }

  attempts.push(
    () =>
      fetch(encodePublicOssMediaUrl(httpsUrl), {
        credentials: "omit",
        headers: { Accept: "application/octet-stream,*/*" },
      }),
    () =>
      fetch(httpsUrl, { cache: "no-store", credentials: "omit", mode: "cors" }),
  );

  let lastStatus = -1;

  for (const run of attempts) {
    try {
      const response = await run();
      lastStatus = response.status;

      if (!response.ok) {
        continue;
      }

      const blob = await response.blob();

      if (blob.size < MIN_LOGIN_VOICE_BYTES) {
        continue;
      }

      const probe = new Uint8Array(await blob.slice(0, 2).arrayBuffer());

      if (probe[0] === 0x7b || probe[0] === 0x3c) {
        continue;
      }

      return blob;
    } catch {
      /* try next */
    }
  }

  throw new Error(`语音拉取失败（${lastStatus}）`);
}
