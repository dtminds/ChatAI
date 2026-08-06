import { render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

describe("dialog and sheet focus", () => {
  it("focuses dialog content when the close button is the only focusable child", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>来源证据</DialogTitle>
          <DialogDescription>查看消息来源</DialogDescription>
          <p>暂无可操作内容</p>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "来源证据" });

    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.getByRole("button", { name: "关闭" })).not.toHaveFocus();
  });

  it("preserves dialog autofocus for the first editable control", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>转发消息</DialogTitle>
          <DialogDescription>选择接收人</DialogDescription>
          <input aria-label="搜索接收人" />
        </DialogContent>
      </Dialog>,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "搜索接收人" })).toHaveFocus();
    });
  });

  it("focuses sheet content when the close button is the only focusable child", async () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>洞察详情</SheetTitle>
          <SheetDescription>查看本轮会话分析</SheetDescription>
          <p>暂无可操作内容</p>
        </SheetContent>
      </Sheet>,
    );

    const sheet = screen.getByRole("dialog", { name: "洞察详情" });

    await waitFor(() => expect(sheet).toHaveFocus());
    expect(screen.getByRole("button", { name: "关闭" })).not.toHaveFocus();
  });

  it("preserves sheet autofocus for the first editable control", async () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>工单详情</SheetTitle>
          <SheetDescription>编辑工单信息</SheetDescription>
          <input aria-label="工单标题" />
        </SheetContent>
      </Sheet>,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "工单标题" })).toHaveFocus();
    });
  });

  it("preserves an explicit dialog autofocus target", async () => {
    function ExplicitAutofocusDialog() {
      const inputRef = useRef<HTMLInputElement>(null);

      return (
        <Dialog defaultOpen>
          <DialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <DialogTitle>采纳入库</DialogTitle>
            <DialogDescription>选择知识库</DialogDescription>
            <input aria-label="选择知识库" ref={inputRef} />
          </DialogContent>
        </Dialog>
      );
    }

    render(<ExplicitAutofocusDialog />);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "选择知识库" })).toHaveFocus();
    });
  });

  it("preserves an explicit sheet autofocus target", async () => {
    function ExplicitAutofocusSheet() {
      const inputRef = useRef<HTMLInputElement>(null);

      return (
        <Sheet defaultOpen>
          <SheetContent
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <SheetTitle>洞察详情</SheetTitle>
            <SheetDescription>查看本轮会话分析</SheetDescription>
            <input aria-label="搜索洞察" ref={inputRef} />
          </SheetContent>
        </Sheet>
      );
    }

    render(<ExplicitAutofocusSheet />);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "搜索洞察" })).toHaveFocus();
    });
  });
});
