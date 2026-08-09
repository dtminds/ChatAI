import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { cn } from "@/lib/utils";
import { AltchaField } from "./altcha-field";
import { resolveLoginRedirect } from "./auth-redirect";
import { login } from "./auth-service";
import { notifyAuthSessionChanged } from "./auth-tokens";
import { useAuthStore } from "@/store/auth-store";

export function LoginPage() {
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = backgroundVideoRef.current;

      if (!video) {
        return;
      }

      if (document.visibilityState !== "visible") {
        video.pause();
        return;
      }

      void video.play().catch(() => undefined);
    };

    if (document.visibilityState !== "visible") {
      backgroundVideoRef.current?.pause();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background p-6 md:p-10">
      <video
        aria-hidden="true"
        autoPlay
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top opacity-60 mix-blend-multiply"
        loop
        muted
        playsInline
        ref={backgroundVideoRef}
      >
        <source
          src="https://b5.bokr.com.cn/dist/ui/0808/leaves.mp4"
          type="video/mp4"
        />
      </video>
      <div className="relative z-10 w-full max-w-4xl">
        <LoginForm />
      </div>
    </main>
  );
}

function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const accountId = useId();
  const passwordId = useId();
  const location = useLocation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [altchaRefreshKey, setAltchaRefreshKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

    setIsSubmitting(true);
    let shouldResetSubmitting = true;

    try {
      const response = await login({ account, altcha, password });

      if (!isMountedRef.current) {
        return;
      }

      shouldResetSubmitting = false;
      setSession(response.data.subUser);
      notifyAuthSessionChanged();
      navigate(resolveLoginRedirect(location.search), { replace: true });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      setErrorMessage(error instanceof Error && error.message ? error.message : "登录失败，请重试");
      setAltchaRefreshKey((key) => key + 1);
    } finally {
      if (shouldResetSubmitting && isMountedRef.current) {
        setIsSubmitting(false);
      }
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
              </div>

              <div className="grid gap-2">
                <Label htmlFor={accountId}>用户名</Label>
                <Input
                  autoComplete="username"
                  className="autofill-reset"
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
                  className="autofill-reset"
                  id={passwordId}
                  name="password"
                  placeholder="请输入密码"
                  required
                  type="password"
                />
              </div>

              <AltchaField refreshKey={altchaRefreshKey} />

              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? "登录中..." : "登录"}
              </Button>
            </div>
          </form>

          <div className="relative hidden bg-muted md:block">
            <img
              alt="登录页占位图"
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
              src="https://b5.bokr.com.cn/dist/ui/0808/login_bg_5.png"
            />
          </div>
        </CardContent>
      </Card>
      <AlertDialog
        open={errorMessage !== null}
        onOpenChange={(open) => {
          if (!open) {
            setErrorMessage(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>登录失败</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-6 text-xs text-muted-foreground">
        <a
          className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=33010902003191"
          rel="noopener noreferrer"
          target="_blank"
        >
          <img
            alt=""
            aria-hidden="true"
            className="size-4 shrink-0"
            src="https://www.bokr.com.cn/assets/img/records/put-on.png"
          />
          <span>浙公网安备 33010902003191号</span>
        </a>
        <a
          className="transition-colors hover:text-foreground"
          href="https://beian.miit.gov.cn/"
          rel="noopener noreferrer"
          target="_blank"
        >
          浙ICP备2020043436号-1
        </a>
      </footer>
    </div>
  );
}
