import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from "@/components/ui/form";
import { Pagination, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ShinyText } from "@/components/ui/shiny-text";
import { Slider } from "@/components/ui/slider";
import {
  Field,
  PreferenceOption,
} from "@/pages/chat/settings/shared";
import { AnimatedTextSwitch } from "@/components/ui/animated-text-switch";
import { Sun01Icon } from "@hugeicons/core-free-icons";

const appStyles = readFileSync(
  resolve(process.cwd(), "src/styles/index.css"),
  "utf8",
);

function BrokenFormFieldUsage() {
  useFormField();
  return null;
}

function DemoForm() {
  const form = useForm({
    defaultValues: {
      name: "",
    },
  });

  return (
    <Form {...form}>
      <FormField
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>模板名称</FormLabel>
            <FormControl>
              <input {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </Form>
  );
}

describe("extended UI primitives", () => {
  it("labels the slider thumb when using aria-label and aria-labelledby", () => {
    render(
      <>
        <Slider aria-label="直接标签" defaultValue={[20]} />
        <span id="sample-rate-label">质检抽样比例</span>
        <Slider aria-labelledby="sample-rate-label" defaultValue={[35]} />
      </>,
    );

    expect(screen.getByRole("slider", { name: "直接标签" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "质检抽样比例" })).toBeInTheDocument();
  });

  it("uses a single thumb by default", () => {
    render(<Slider />);

    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("preserves the content and accessible label of shiny text", () => {
    render(
      <ShinyText
        aria-label="AI 正在思考"
        baseColor="rgb(120 120 120)"
        duration={1.7}
        highlightColor="rgb(20 20 20)"
      >
        AI正在生成话术...
      </ShinyText>,
    );

    const text = screen.getByText("AI正在生成话术...");
    expect(text).toHaveAttribute("data-slot", "shiny-text");
    expect(text).toHaveAttribute("aria-label", "AI 正在思考");
    expect(text).toHaveStyle({
      "--shiny-text-base-color": "rgb(120 120 120)",
      "--shiny-text-cycle-duration": "2s",
      "--shiny-text-highlight-color": "rgb(20 20 20)",
    });
  });

  it("keeps the text filled while pausing after a complete shiny sweep", () => {
    const shinyTextRule = appStyles.match(/\.shiny-text\s*\{([^}]*)\}/)?.[1];
    const shinyTextKeyframes = appStyles.match(
      /@keyframes shiny-text-sweep\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(shinyTextRule).toContain(
      "background-color: var(--shiny-text-base-color)",
    );
    expect(shinyTextRule).toContain("background-repeat: no-repeat");
    expect(shinyTextKeyframes).toContain("background-position: -50% center");
  });

  it("renders animated text switch as a single accessible phrase", () => {
    const { rerender } = render(<AnimatedTextSwitch value="正在生成" />);

    const text = screen.getByLabelText("正在生成");
    expect(text).toHaveAttribute("data-slot", "animated-text-switch");
    expect(text.querySelectorAll("[data-slot='animated-text-switch-char']")).toHaveLength(
      4,
    );

    rerender(<AnimatedTextSwitch value="可发送" />);

    expect(screen.getByLabelText("可发送")).toBeInTheDocument();
  });

  it("exits the previous text before entering the next text", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <AnimatedTextSwitch staggerMs={1} value="等待发送" />,
    );

    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "等待发送",
    );

    rerender(<AnimatedTextSwitch staggerMs={1} value="正在发送" />);

    expect(container.querySelector("[data-phase='exit']")).toHaveTextContent(
      "等待发送",
    );
    expect(container.querySelector("[data-phase='enter']")).toBeNull();
    expect(container.textContent).not.toContain("正在发送");

    act(() => {
      vi.advanceTimersByTime(130);
    });

    expect(container.querySelector("[data-phase='exit']")).toBeNull();
    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "正在发送",
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(container.querySelector("[data-phase='exit']")).toBeNull();
    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "正在发送",
    );
    vi.useRealTimers();
  });

  it("keeps the current exit text and enters the latest value when updates happen during exit", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <AnimatedTextSwitch staggerMs={1} value="等待发送" />,
    );

    rerender(<AnimatedTextSwitch staggerMs={1} value="正在生成" />);

    expect(container.querySelector("[data-phase='exit']")).toHaveTextContent(
      "等待发送",
    );

    act(() => {
      vi.advanceTimersByTime(60);
    });

    rerender(<AnimatedTextSwitch staggerMs={1} value="正在发送" />);

    expect(container.querySelector("[data-phase='exit']")).toHaveTextContent(
      "等待发送",
    );
    expect(container.textContent).not.toContain("正在生成");
    expect(container.textContent).not.toContain("正在发送");

    act(() => {
      vi.advanceTimersByTime(70);
    });

    expect(container.querySelector("[data-phase='exit']")).toBeNull();
    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "正在发送",
    );
    expect(container.textContent).not.toContain("正在生成");
    vi.useRealTimers();
  });

  it("finishes the current enter animation before switching to a pending value", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <AnimatedTextSwitch staggerMs={1} value="等待发送" />,
    );

    rerender(<AnimatedTextSwitch staggerMs={1} value="正在生成" />);

    act(() => {
      vi.advanceTimersByTime(130);
    });

    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "正在生成",
    );

    rerender(<AnimatedTextSwitch staggerMs={1} value="正在发送" />);

    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "正在生成",
    );
    expect(container.querySelector("[data-phase='exit']")).toBeNull();
    expect(container.textContent).not.toContain("正在发送");

    act(() => {
      vi.advanceTimersByTime(170);
    });

    expect(container.querySelector("[data-phase='exit']")).toHaveTextContent(
      "正在生成",
    );

    act(() => {
      vi.advanceTimersByTime(130);
    });

    expect(container.querySelector("[data-phase='exit']")).toBeNull();
    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "正在发送",
    );
    vi.useRealTimers();
  });

  it("enables shiny text only after switch animation settles", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <AnimatedTextSwitch
        shiny
        shinyBaseColor="rgb(120 120 120)"
        shinyDuration={1.1}
        shinyHighlightColor="rgb(20 20 20)"
        staggerMs={1}
        value="等待发送"
      />,
    );

    expect(container.querySelector("[data-phase='enter']")).toHaveClass(
      "shiny-text",
    );
    expect(
      container.querySelector("[data-phase='enter'] [data-slot='animated-text-switch-char']"),
    ).toBeNull();
    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "等待发送",
    );

    rerender(
      <AnimatedTextSwitch
        shiny
        shinyBaseColor="rgb(120 120 120)"
        shinyDuration={1.1}
        shinyHighlightColor="rgb(20 20 20)"
        staggerMs={1}
        value="正在发送"
      />,
    );

    expect(container.querySelector("[data-phase='exit']")).not.toHaveClass(
      "shiny-text",
    );

    act(() => {
      vi.advanceTimersByTime(130);
    });

    expect(container.querySelector("[data-phase='enter']")).not.toHaveClass(
      "shiny-text",
    );

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(container.querySelector("[data-phase='enter']")).toHaveClass(
      "shiny-text",
    );
    expect(container.querySelector("[data-phase='enter']")).toHaveStyle({
      "--shiny-text-base-color": "rgb(120 120 120)",
      "--shiny-text-highlight-color": "rgb(20 20 20)",
    });
    expect(
      container.querySelector("[data-phase='enter'] [data-slot='animated-text-switch-char']"),
    ).toBeNull();
    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "正在发送",
    );
    vi.useRealTimers();
  });

  it("supports distinct labels for range slider thumbs", () => {
    render(<Slider defaultValue={[20, 80]} thumbLabels={["最小值", "最大值"]} />);

    expect(screen.getByRole("slider", { name: "最小值" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "最大值" })).toBeInTheDocument();
  });

  it("uses the controlled slider value to determine thumb count", () => {
    render(
      <Slider
        aria-label="受控比例"
        defaultValue={[20, 80]}
        onValueChange={() => {}}
        value={[35]}
      />,
    );

    expect(screen.getAllByRole("slider", { name: "受控比例" })).toHaveLength(1);
  });

  it("uses localized pagination labels by default", () => {
    render(
      <Pagination>
        <PaginationPrevious href="#" />
        <PaginationNext href="#" />
      </Pagination>,
    );

    expect(screen.getByRole("navigation", { name: "分页" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "上一页" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下一页" })).toBeInTheDocument();
  });

  it("passes orientation through to resizable panel groups", () => {
    render(
      <ResizablePanelGroup orientation="vertical">
        <ResizablePanel>上</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>下</ResizablePanel>
      </ResizablePanelGroup>,
    );

    expect(screen.getByRole("separator")).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
  });

  it("throws a clear error when form field helpers are used outside form fields", () => {
    expect(() => render(<BrokenFormFieldUsage />)).toThrow(
      "useFormField should be used within <FormField>",
    );
  });

  it("links form labels to controls", () => {
    render(<DemoForm />);

    expect(screen.getByLabelText("模板名称")).toBeInTheDocument();
  });

  it("allows demo field labels to target nested controls explicitly", () => {
    render(
      <Field htmlFor="nested-control" label="嵌套控件">
        <div>
          <input id="nested-control" />
        </div>
      </Field>,
    );

    expect(screen.getByLabelText("嵌套控件")).toBeInTheDocument();
  });

  it("does not nest headings inside preference option buttons", () => {
    render(
      <PreferenceOption
        description="适合白天办公环境。"
        icon={Sun01Icon}
        title="浅色模式"
      />,
    );

    const button = screen.getByRole("button", { name: /浅色模式/ });

    expect(button.querySelector("h1,h2,h3,h4,h5,h6")).toBeNull();
  });
});
