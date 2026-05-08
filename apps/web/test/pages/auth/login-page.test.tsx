import { createMemoryRouter, RouterProvider } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { requestInstance } from "@/lib/request";
import { routerConfig } from "@/router";

const mock = new MockAdapter(requestInstance);

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
    setSecureContext(true);
  });

  it("renders the shadcn login layout with username and password only", async () => {
    setSecureContext(true);
    renderLoginRoute();

    expect(await screen.findByRole("heading", { name: "欢迎回来" })).toBeInTheDocument();
    expect(screen.getByText("登录你的 AI 客服工作台账号")).toBeInTheDocument();
    expect(screen.getByLabelText("用户名")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(document.querySelector("altcha-widget")).toBeInTheDocument();
    expect(screen.getByAltText("登录页占位图")).toHaveAttribute(
      "src",
      "https://ui.shadcn.com/placeholder.svg",
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
});

function renderLoginRoute() {
  const router = createMemoryRouter(routerConfig, {
    initialEntries: ["/login"],
  });

  render(<RouterProvider router={router} />);
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
