import { type FormEvent, useId } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AltchaField } from "./altcha-field";

export function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-4xl">
        <LoginForm />
      </div>
    </main>
  );
}

function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const accountId = useId();
  const passwordId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden rounded-lg p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">欢迎回来</h1>
                <p className="text-balance text-muted-foreground">
                  登录你的 AI 客服工作台账号
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
                  <a
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                    href="#"
                  >
                    忘记密码？
                  </a>
                </div>
                <Input
                  autoComplete="current-password"
                  id={passwordId}
                  name="password"
                  required
                  type="password"
                />
              </div>

              <AltchaField />

              <Button className="w-full rounded-md" type="submit">
                登录
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
