import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileUploadSelectedFile } from "@/components/ui/file-upload";

describe("file upload components", () => {
  it("keeps the full selected file label available for long names", () => {
    const longFileName =
      "dzfp_26952000002187407731_水滴鱼（深圳）科技服务有限公司_20260527154944.pdf";
    const onClear = vi.fn();

    render(
      <div className="grid w-[320px]">
        <FileUploadSelectedFile
          file={new File(["document"], longFileName, {
            type: "application/pdf",
          })}
          icon={<span aria-hidden="true" className="size-8" />}
          label="已选择文档"
          meta="共 2 个 sheet，42 行"
          onClear={onClear}
        />
      </div>,
    );

    const selectedFile = screen.getByRole("region", { name: "已选择文档" });
    const fileName = within(selectedFile).getByText(/dzfp_26952000002187407731/);

    expect(fileName).toHaveAttribute(
      "title",
      `${longFileName}（8B，共 2 个 sheet，42 行）`,
    );
    expect(
      within(selectedFile).getByRole("button", { name: "移除已选择文件" }),
    ).toBeEnabled();
  });

  it("supports clearing selected files without an icon", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <FileUploadSelectedFile
        file={new File(["plain text"], "readme.txt", { type: "text/plain" })}
        label="已选择文件"
        onClear={onClear}
      />,
    );

    const selectedFile = screen.getByRole("region", { name: "已选择文件" });

    expect(within(selectedFile).getByText("readme.txt（10B）")).toHaveAttribute(
      "title",
      "readme.txt（10B）",
    );

    await user.click(
      within(selectedFile).getByRole("button", { name: "移除已选择文件" }),
    );

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
