import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AiHostingModel } from "@chatai/contracts";
import { AiModelSelect } from "@/pages/chat/ai-hosting/ai-model-select";

const models: AiHostingModel[] = [{
  creditMultiplier: 150,
  description: "模型描述",
  id: "model-1",
  label: "Kimi-K3",
  model: "kimi-k3",
  name: "Kimi-K3",
  supportMultimodal: false,
}];

describe("AiModelSelect", () => {
  it("shows the credit multiplier on the model option", async () => {
    const user = userEvent.setup();
    render(
      <AiModelSelect
        ariaLabel="模型"
        models={models}
        onValueChange={() => undefined}
        placeholder="请选择模型"
        value=""
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "模型" }));

    expect(await screen.findByRole("option", { name: /Kimi-K3.*1\.5x/ })).toBeInTheDocument();
  });

  it("does not show the multiplier in the selected trigger", () => {
    render(
      <AiModelSelect
        ariaLabel="模型"
        models={models}
        onValueChange={() => undefined}
        placeholder="请选择模型"
        value="model-1"
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "模型" });

    expect(trigger).toHaveTextContent("Kimi-K3");
    expect(trigger).not.toHaveTextContent("1.5x");
  });

  it("forwards field identity and invalid state to the trigger", () => {
    render(
      <AiModelSelect
        ariaInvalid
        ariaLabel="模型"
        id="model-field"
        models={models}
        onValueChange={() => undefined}
        placeholder="请选择模型"
        value="model-1"
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "模型" });

    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("id", "model-field");
  });
});
