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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Field,
  PreferenceOption,
} from "@/pages/chat/settings/shared";
import { AnimatedTextSwitch } from "@/components/ui/animated-text-switch";
import { Sun01Icon } from "@hugeicons/core-free-icons";

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

  it("renders reusable shiny text with custom shimmer width", () => {
    render(
      <ShinyText
        aria-label="AI 正在思考"
        className="text-primary"
        duration={1.2}
        shimmerWidth={96}
      >
        AI正在生成话术...
      </ShinyText>,
    );

    const text = screen.getByText("AI正在生成话术...");
    expect(text).toHaveAttribute("data-slot", "shiny-text");
    expect(text).toHaveAttribute("aria-label", "AI 正在思考");
    expect(text).toHaveStyle({ "--shiny-text-duration": "1.2s" });
    expect(text).toHaveStyle({ "--shiny-text-shimmer-width": "96px" });
    expect(text).toHaveClass("text-primary");
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
        shinyDuration={1.1}
        shinyShimmerWidth={72}
        staggerMs={1}
        value="等待发送"
      />,
    );

    expect(container.querySelector("[data-phase='enter']")).toHaveClass(
      "shiny-text",
    );
    expect(container.querySelector("[data-phase='enter']")).toHaveStyle({
      "--shiny-text-duration": "1.1s",
      "--shiny-text-shimmer-width": "72px",
    });
    expect(
      container.querySelector("[data-phase='enter'] [data-slot='animated-text-switch-char']"),
    ).toBeNull();
    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "等待发送",
    );

    rerender(
      <AnimatedTextSwitch
        shiny
        shinyDuration={1.1}
        shinyShimmerWidth={72}
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
    expect(
      container.querySelector("[data-phase='enter'] [data-slot='animated-text-switch-char']"),
    ).toBeNull();
    expect(container.querySelector("[data-phase='enter']")).toHaveTextContent(
      "正在发送",
    );
    vi.useRealTimers();
  });

  it("uses source-matched active shadow without forcing underline tabs", () => {
    render(
      <>
        <Tabs defaultValue="open">
          <TabsList aria-label="默认标签">
            <TabsTrigger value="open">待处理</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs defaultValue="underline">
          <TabsList className="rounded-none bg-transparent p-0">
            <TabsTrigger
              className="rounded-none border-b-2 border-transparent bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              value="underline"
            >
              普通
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </>,
    );

    expect(screen.getByRole("tablist", { name: "默认标签" })).toHaveClass(
      "bg-secondary/90",
    );
    expect(screen.getByRole("tab", { name: "待处理" })).toHaveClass(
      "data-[state=active]:bg-[var(--tabs-trigger-active-bg)]",
      "data-[state=active]:shadow-[var(--tabs-trigger-active-shadow)]",
    );
    expect(screen.getByRole("tab", { name: "普通" })).toHaveClass(
      "data-[state=active]:bg-transparent",
      "data-[state=active]:shadow-none",
    );
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
