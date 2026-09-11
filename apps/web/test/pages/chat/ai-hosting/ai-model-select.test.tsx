import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("does not invent a multiplier for a local fallback option", async () => {
    const user = userEvent.setup();
    render(
      <AiModelSelect
        ariaLabel="模型"
        models={[{
          id: "fallback",
          label: "默认模型",
          model: "default-model",
        }]}
        onValueChange={() => undefined}
        placeholder="请选择模型"
        value=""
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "模型" }));

    expect(await screen.findByRole("option", { name: "默认模型" })).not.toHaveTextContent("1x");
  });

  it("shows an unavailable model snapshot and still allows switching models", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <AiModelSelect
        ariaLabel="模型"
        models={models}
        onValueChange={onValueChange}
        placeholder="请选择模型"
        unavailableModel={{ label: "旧模型", model: "legacy-model" }}
        unavailableModelId="legacy-model-id"
        value="legacy-model-id"
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "模型" });
    expect(trigger).toHaveTextContent("旧模型");

    await user.click(trigger);

    expect(await screen.findByRole("option", { name: "原模型不可用" }))
      .toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("option", { name: /Kimi-K3.*1\.5x/ }));
    expect(onValueChange).toHaveBeenCalledWith("model-1");
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
