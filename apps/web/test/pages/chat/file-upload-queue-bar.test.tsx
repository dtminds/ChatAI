import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileUploadQueueBar } from "@/pages/chat/components/file-upload-queue-bar";

describe("FileUploadQueueBar", () => {
  it("cancels the queued upload from the queue item", async () => {
    const user = userEvent.setup();
    const onCancelFileUpload = vi.fn();

    render(
      <FileUploadQueueBar
        items={[
          {
            fileName: "报价单.pdf",
            id: "file-upload-1",
            progress: 12,
            status: "uploading",
          },
        ]}
        onCancelFileUpload={onCancelFileUpload}
      />,
    );

    expect(screen.getByText("报价单.pdf")).toBeInTheDocument();
    expect(screen.getByText("正在准备发送")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消上传 报价单.pdf" }));
    expect(onCancelFileUpload).toHaveBeenCalledWith("file-upload-1");
  });
});
