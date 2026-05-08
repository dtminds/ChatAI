import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
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
import { Slider } from "@/components/ui/slider";

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
});
