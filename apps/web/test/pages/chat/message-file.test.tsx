import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileMessageCard } from "@/pages/chat/components/message";
import type { FileMessageContent } from "@/pages/chat/chat-types";

describe("FileMessageCard", () => {
  it.each([
    ["xls", "Excel 文件", "https://b5.bokr.com.cn/dist/excel.png"],
    ["xlsx", "Excel 文件", "https://b5.bokr.com.cn/dist/excel.png"],
    ["csv", "Excel 文件", "https://b5.bokr.com.cn/dist/excel.png"],
    ["pdf", "PDF 文件", "https://b5.bokr.com.cn/dist/pdf.png"],
    ["doc", "Word 文件", "https://b5.bokr.com.cn/dist/word.png"],
    ["docx", "Word 文件", "https://b5.bokr.com.cn/dist/word.png"],
    ["ppt", "PPT 文件", "https://b5.bokr.com.cn/dist/ppt.png"],
    ["pptx", "PPT 文件", "https://b5.bokr.com.cn/dist/ppt.png"],
    ["zip", "压缩文件", "https://b5.bokr.com.cn/dist/zip.png"],
    ["rar", "压缩文件", "https://b5.bokr.com.cn/dist/zip.png"],
  ])("renders the configured file type icon for %s files", (extension, label, src) => {
    render(
      <FileMessageCard
        content={{
          ...createFileContent(),
          extension,
          fileName: `报价单.${extension}`,
        }}
      />,
    );

    expect(screen.getByRole("img", { name: label })).toHaveAttribute("src", src);
    expect(screen.queryByText(extension)).not.toBeInTheDocument();
  });

  it("renders the default file icon for unknown extensions", () => {
    render(
      <FileMessageCard
        content={{
          ...createFileContent(),
          extension: "txt",
          fileName: "备注.txt",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "文件" })).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/file.png",
    );
    expect(screen.queryByText("txt")).not.toBeInTheDocument();
  });

  it("renders the default file icon when runtime data omits the extension", () => {
    render(
      <FileMessageCard
        content={{
          ...createFileContent(),
          extension: null,
          fileName: "备注",
        } as unknown as FileMessageContent}
      />,
    );

    expect(screen.getByRole("img", { name: "文件" })).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/file.png",
    );
  });

  it("can hide the download action while keeping the file type icon", () => {
    render(
      <FileMessageCard
        content={createFileContent()}
        showDownloadAction={false}
      />,
    );

    expect(screen.getByRole("img", { name: "PDF 文件" }))
      .toHaveAttribute("src", "https://b5.bokr.com.cn/dist/pdf.png");
    expect(screen.queryByRole("button", { name: "下载文件：报价单.pdf" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "文件下载中" }))
      .not.toBeInTheDocument();
  });

  it("keeps file size in the bottom metadata row when download is shown", () => {
    render(
      <FileMessageCard
        content={createFileContent()}
      />,
    );

    const card = screen.getByTestId("file-message-card");
    const metadataRow = screen.getByText("文件").closest("div");

    expect(metadataRow).toContainElement(screen.getByText("2 KB"));
    expect(card.firstElementChild).not.toContainElement(screen.getByText("2 KB"));
  });

  it("reserves two title lines so file size does not change card height", () => {
    render(
      <FileMessageCard
        content={createFileContent()}
      />,
    );

    expect(screen.getByText("报价单.pdf")).toHaveClass("min-h-10", "line-clamp-2");
  });

  it("keeps file size in the bottom metadata row when download is hidden", () => {
    render(
      <FileMessageCard
        content={createFileContent()}
        showDownloadAction={false}
      />,
    );

    const card = screen.getByTestId("file-message-card");
    const metadataRow = screen.getByText("文件").closest("div");

    expect(metadataRow).toContainElement(screen.getByText("2 KB"));
    expect(card.firstElementChild).not.toContainElement(screen.getByText("2 KB"));
  });

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
      />,
    );

    expect(screen.getByRole("status", { name: "文件下载中" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载文件：报价单.pdf" }))
      .not.toBeInTheDocument();
  });

  it("renders initial server-side in-progress files as downloading", () => {
    render(
      <FileMessageCard
        content={{
          ...createFileContent(),
          downloadStatus: "ing",
          fileSerialNo: "serial-file-001",
          fileUrl: "",
        }}
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
