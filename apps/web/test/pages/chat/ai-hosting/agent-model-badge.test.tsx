import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentModelBadge } from "@/pages/chat/ai-hosting/agent-model-badge";

describe("AgentModelBadge", () => {
  it("uses provider icons for versioned Doubao and DeepSeek model names", () => {
    const { rerender } = render(<AgentModelBadge model="Doubao-Seed-2.0-pro" />);

    expect(screen.getByTitle("模型图标：Doubao-Seed-2.0-pro").querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
    );

    rerender(<AgentModelBadge model="Doubao-seed-2-0-lite" />);

    expect(screen.getByTitle("模型图标：Doubao-seed-2-0-lite").querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
    );

    rerender(<AgentModelBadge model="DeepSeek-V3.2" />);

    expect(screen.getByTitle("模型图标：DeepSeek-V3.2").querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/llm/deepseek-color.svg",
    );
  });

  it("retries model icon image when model changes after a load failure", async () => {
    const { rerender } = render(<AgentModelBadge model="doubao-2.0-lite" />);
    const doubaoIcon = screen.getByTitle("模型图标：Doubao-2.0-lite");

    expect(doubaoIcon.querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
    );

    fireEvent.error(doubaoIcon.querySelector("img") as HTMLImageElement);

    expect(doubaoIcon.querySelector("img")).not.toBeInTheDocument();

    rerender(<AgentModelBadge model="Doubao-2.0-lite" />);

    await waitFor(() => {
      expect(screen.getByTitle("模型图标：Doubao-2.0-lite").querySelector("img")).toHaveAttribute(
        "src",
        "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
      );
    });
  });
});
