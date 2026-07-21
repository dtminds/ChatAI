import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section
        aria-labelledby="not-found-title"
        className="w-full max-w-md text-center"
      >
        <img
          alt=""
          aria-hidden="true"
          className="mx-auto h-auto max-w-full"
          height="200"
          src="https://b5.bokr.com.cn/dist/ui/404.svg"
          width="270"
        />
        <h1
          className="mt-6 text-2xl font-semibold text-foreground"
          id="not-found-title"
        >
          页面不存在
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          访问地址可能有误，或页面已被移动
        </p>
        <Button asChild className="mt-6">
          <Link to="/">返回首页</Link>
        </Button>
      </section>
    </main>
  );
}
