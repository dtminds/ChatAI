import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatAgentClarificationPrompt } from "@/pages/chat/components/chat-agent-clarification-prompt";

const input = {
  question: "物流停滞超过 48 小时，请确认下一步处理方式",
  suggestions: [
    {
      id: "REFUND",
      instruction: "为该订单办理仅退款",
      label: "办理仅退款",
    },
    {
      id: "EXPEDITE",
      instruction: "先联系物流加急催派，暂不退款",
      label: "加急催派",
    },
  ],
};

describe("ChatAgentClarificationPrompt", () => {
  it("returns either a suggested response or a different operator instruction", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    const onTerminate = vi.fn();
    const { rerender } = render(
      <ChatAgentClarificationPrompt
        input={input}
        onRespond={onRespond}
        onTerminate={onTerminate}
      />,
    );

    expect(screen.getByRole("button", { name: "办理仅退款" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(onRespond).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(onRespond).toHaveBeenLastCalledWith({
      suggestionId: "REFUND",
      type: "suggestion",
    });

    rerender(
      <ChatAgentClarificationPrompt
        input={input}
        onRespond={onRespond}
        onTerminate={onTerminate}
      />,
    );
    const instructionInput = screen.getByRole("textbox", {
      name: "告诉 AI 另一种处理方式",
    });
    await user.click(instructionInput);
    expect(screen.getByRole("button", { name: "办理仅退款" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await user.type(
      instructionInput,
      "不要退款，先联系物流确认包裹位置",
    );
    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(onRespond).toHaveBeenLastCalledWith({
      instruction: "不要退款，先联系物流确认包裹位置",
      type: "instruction",
    });

    await user.click(screen.getByRole("button", { name: "终止" }));
    expect(onTerminate).toHaveBeenCalledOnce();
  });
});
