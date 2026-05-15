import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileMessageCard } from "@/pages/chat/components/message";
import type { FileMessageContent } from "@/pages/chat/chat-types";

describe("FileMessageCard", () => {
  it("renders a clickable transfer button when the file is not stored in COS", async () => {
    const user = userEvent.setup();
    const handleDownloadClick = vi.fn();

    render(
      <FileMessageCard
        content={{
          ...createFileContent(),
          downloadStatus: "failed",
          fileSerialNo: "serial-file-001",
          fileUrl: "",
        }}
        transferState="idle"
        onDownloadClick={handleDownloadClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "下载文件：报价单.pdf" }));

    expect(handleDownloadClick).toHaveBeenCalledTimes(1);
  });

  it("renders download-in-progress state inside the file card", () => {
    render(
      <FileMessageCard
        content={{
          ...createFileContent(),
          downloadStatus: "ing",
          fileSerialNo: "serial-file-001",
          fileUrl: "",
        }}
        transferState="transferring"
      />,
    );

    expect(screen.getByRole("status", { name: "文件下载中" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载文件：报价单.pdf" }))
      .not.toBeInTheDocument();
  });

  it("uses the direct file download handler when the file is already stored in COS", async () => {
    const user = userEvent.setup();
    const handleDownloadClick = vi.fn();

    render(
      <FileMessageCard
        content={{
          ...createFileContent(),
          downloadStatus: "finished",
          fileSerialNo: "serial-file-001",
          fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
        }}
        transferState="idle"
        onDownloadClick={handleDownloadClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "下载文件：报价单.pdf" }));

    expect(handleDownloadClick).toHaveBeenCalledTimes(1);
  });
});

function createFileContent(): FileMessageContent {
  return {
    extension: "pdf",
    fileName: "报价单.pdf",
    fileSizeLabel: "2 KB",
    sourceLabel: "文件",
    type: "file",
  };
}
