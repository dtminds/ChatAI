import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { StrictMode } from "react";
import MockAdapter from "axios-mock-adapter";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { requestInstance } from "@/lib/request";
import { routerConfig } from "@/router";
import { useAuthStore } from "@/store/auth-store";

const mock = new MockAdapter(requestInstance);
const operatorSubUser = {
  accountType: "sub" as const,
  displayName: "客服一号",
  permissions: ["chat.access", "chat.send", "chat.takeover"] as const,
  role: "operator" as const,
  subUserId: "101",
};

vi.mock("altcha/lib", () => ({
  scrypt: {
    deriveKey: vi.fn(),
  },
  solveChallenge: vi.fn(async () => ({
    derivedKey: "derived-key-001",
    salt: "salt-001",
  })),
}));

describe("LoginPage", () => {
  afterEach(() => {
    mock.reset();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    setSecureContext(true);
    window.localStorage.clear();
  });

  it("renders the shadcn login layout with username and password only", async () => {
    setSecureContext(true);
    renderLoginRoute();

    expect(await screen.findByRole("heading", { name: "欢迎回来" })).toBeInTheDocument();
    expect(screen.getByLabelText("用户名")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    const altchaWidget = await waitFor(() => {
      const widget = document.querySelector("altcha-widget");

      if (!widget) {
        throw new Error("ALTCHA widget is not mounted yet.");
      }

      return widget;
    });
    expect(altchaWidget).toBeInTheDocument();
    expect(altchaWidget).toHaveAttribute("data-altcha-theme", "business");
    expect(altchaWidget).toHaveStyle({ "--altcha-max-width": "100%" });
    expect(JSON.parse(getAltchaConfiguration(altchaWidget))).toEqual({
      hideFooter: true,
      hideLogo: true,
    });
    expect(screen.getByAltText("登录页占位图")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/login_bg_2.png",
    );
    expect(screen.queryByText("注册")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Or continue with|快捷登录|Apple|Google|Meta/i),
    ).not.toBeInTheDocument();
  });

  it("uses a fallback ALTCHA control outside secure browser contexts", async () => {
    setSecureContext(false);

    renderLoginRoute();

    expect(await screen.findByText("请完成人机验证")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "验证" })).toBeInTheDocument();
    expect(document.querySelector("altcha-widget")).not.toBeInTheDocument();
    expect(document.querySelector('input[name="altcha"]')).toBeInTheDocument();
  });

  it("guides users to contact an administrator when resetting password", async () => {
    const user = userEvent.setup();
    setSecureContext(true);

    renderLoginRoute();

    await user.click(await screen.findByRole("button", { name: "忘记密码？" }));

    const dialog = await screen.findByRole("dialog", { name: "重置密码" });
    expect(dialog).toHaveTextContent("为了保障账号安全，请使用主账号登录，然后在设置中重置子账号的密码");
  });

  it("solves the fallback ALTCHA control and stores the payload", async () => {
    const user = userEvent.setup();
    setSecureContext(false);
    mock.onGet("/auth/altcha/challenge").reply(200, {
      parameters: {
        algorithm: "SCRYPT",
        challenge: "challenge-001",
        data: {
          challengeId: "challenge-id-001",
        },
      },
      signature: "signature-001",
    });

    renderLoginRoute();

    await user.click(await screen.findByRole("button", { name: "验证" }));

    expect(await screen.findByText("人机验证已通过")).toBeInTheDocument();
    expect(document.querySelector<HTMLInputElement>('input[name="altcha"]')?.value).toEqual(
      window.btoa(
        JSON.stringify({
          challenge: {
            parameters: {
              algorithm: "SCRYPT",
              challenge: "challenge-001",
              data: {
                challengeId: "challenge-id-001",
              },
            },
            signature: "signature-001",
          },
          solution: {
            derivedKey: "derived-key-001",
            salt: "salt-001",
          },
        }),
      ),
    );
    expect(mock.history.post).toEqual([]);
  });

  it("uses a short timeout when solving the fallback ALTCHA challenge", async () => {
    const user = userEvent.setup();
    setSecureContext(false);
    mock.onGet("/auth/altcha/challenge").reply(200, {
      parameters: {
        algorithm: "SCRYPT",
        challenge: "challenge-001",
      },
      signature: "signature-001",
    });

    renderLoginRoute();

    await user.click(await screen.findByRole("button", { name: "验证" }));
    await screen.findByText("人机验证已通过");

    const { solveChallenge } = await import("altcha/lib");
    expect(solveChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 15000,
      }),
    );
  });

  it("logs in with account, password, and ALTCHA payload", async () => {
    const user = userEvent.setup();
    setSecureContext(false);
    mock.onGet("/auth/altcha/challenge").reply(200, {
      parameters: {
        algorithm: "SCRYPT",
        challenge: "challenge-001",
        data: {
          challengeId: "challenge-id-001",
        },
      },
      signature: "signature-001",
    });
    mock.onPost("/auth/login").reply((config) => [
      200,
      {
        data: {
          expiresIn: 1200,
          subUser: operatorSubUser,
        },
        success: true,
      },
    ]);

    const router = renderLoginRoute();

    await user.type(await screen.findByLabelText("用户名"), "agent001");
    await user.type(screen.getByLabelText("密码"), "correct-password");
    await user.click(screen.getByRole("button", { name: "验证" }));
    await screen.findByText("人机验证已通过");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(window.localStorage.getItem("chatai.accessToken")).toBeNull();
    expect(window.localStorage.getItem("chatai.refreshToken")).toBeNull();
    expect(router.state.location.pathname).toBe("/chat");
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      account: "agent001",
      altcha: expect.any(String),
      password: "correct-password",
    });
  });

  it("stays on chat after login even before the next session check succeeds", async () => {
    const user = userEvent.setup();
    setSecureContext(false);
    mock.onGet("/auth/altcha/challenge").reply(200, {
      parameters: {
        algorithm: "SCRYPT",
        challenge: "challenge-001",
      },
      signature: "signature-001",
    });
    mock.onPost("/auth/login").reply(200, {
      data: {
        expiresIn: 1200,
        subUser: operatorSubUser,
      },
      success: true,
    });
    mock.onGet("/auth/session").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });

    const router = renderLoginRoute();

    await user.type(await screen.findByLabelText("用户名"), "agent001");
    await user.type(screen.getByLabelText("密码"), "correct-password");
    await user.click(screen.getByRole("button", { name: "验证" }));
    await screen.findByText("人机验证已通过");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(mock.history.get.filter((request) => request.url === "/auth/session")).toHaveLength(0);
  });

  it("shows a blocking error dialog when credentials are rejected", async () => {
    const user = userEvent.setup();
    setSecureContext(false);
    mock.onGet("/auth/altcha/challenge").reply(200, {
      parameters: {
        algorithm: "SCRYPT",
        challenge: "challenge-001",
      },
      signature: "signature-001",
    });
    mock.onPost("/auth/login").reply(401, {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "用户名或密码错误",
      },
      success: false,
    });

    const router = renderLoginRoute();

    await user.type(await screen.findByLabelText("用户名"), "agent001");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "验证" }));
    await screen.findByText("人机验证已通过");
    await user.click(screen.getByRole("button", { name: "登录" }));

    const errorDialog = await screen.findByRole("alertdialog", { name: "登录失败" });
    expect(errorDialog).toHaveTextContent("用户名或密码错误");
    expect(screen.getByRole("button", { name: "知道了" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("chatai.accessToken")).toBeNull();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("refreshes the fallback ALTCHA payload after a failed login", async () => {
    const user = userEvent.setup();
    setSecureContext(false);
    const challenges = [
      {
        parameters: {
          algorithm: "SCRYPT",
          challenge: "challenge-001",
        },
        signature: "signature-001",
      },
      {
        parameters: {
          algorithm: "SCRYPT",
          challenge: "challenge-002",
        },
        signature: "signature-002",
      },
    ];

    mock.onGet("/auth/altcha/challenge").reply(() => {
      const challenge = challenges.shift();

      return challenge ? [200, challenge] : [500, {}];
    });
    mock.onPost("/auth/login").reply((config) => {
      const payload = JSON.parse(config.data ?? "{}") as { password?: string };

      if (payload.password === "correct-password") {
        return [
          200,
          {
            data: {
              expiresIn: 1200,
              subUser: operatorSubUser,
            },
            success: true,
          },
        ];
      }

      return [
        401,
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "用户名或密码错误",
          },
          success: false,
        },
      ];
    });

    const router = renderLoginRoute();

    await user.type(await screen.findByLabelText("用户名"), "agent001");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "验证" }));
    await screen.findByText("人机验证已通过");
    await user.click(screen.getByRole("button", { name: "登录" }));

    const errorDialog = await screen.findByRole("alertdialog", { name: "登录失败" });
    expect(errorDialog).toHaveTextContent("用户名或密码错误");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByText("人机验证已通过")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "知道了" }));
    await user.clear(screen.getByLabelText("密码"));
    await user.type(screen.getByLabelText("密码"), "correct-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(router.state.location.pathname).toBe("/chat");
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toMatchObject({
      account: "agent001",
      password: "wrong-password",
    });
    expect(JSON.parse(mock.history.post[1]?.data ?? "{}")).toMatchObject({
      account: "agent001",
      password: "correct-password",
    });
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}").altcha).not.toEqual(
      JSON.parse(mock.history.post[1]?.data ?? "{}").altcha,
    );
  });
});

function renderLoginRoute() {
  const router = createMemoryRouter(routerConfig, {
    initialEntries: ["/login"],
  });

  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );

  return router;
}

function setSecureContext(value: boolean) {
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value,
  });

  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
}

function getAltchaConfiguration(widget: Element | null) {
  return (widget as Element & { configuration?: string } | null)?.configuration ?? "{}";
}
