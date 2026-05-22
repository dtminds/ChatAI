import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import type { RequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { AltchaField } from "./altcha-field";
import { login } from "./auth-service";
import { notifyAuthSessionChanged } from "./auth-tokens";

export function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-4xl">
        <LoginForm />
      </div>
    </main>
  );
}

function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const accountId = useId();
  const passwordId = useId();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [altchaRefreshKey, setAltchaRefreshKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
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
      await login({ account, altcha, password });

      if (!isMountedRef.current) {
        return;
      }

      shouldResetSubmitting = false;
      notifyAuthSessionChanged();
      navigate("/chat", { replace: true });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      setErrorMessage((error as RequestError).message ?? "登录失败，请重试");
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
                <p className="text-balance text-muted-foreground">
                  登录你的客服工作台
                </p>
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
              src="https://ui.shadcn.com/placeholder.svg"
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
