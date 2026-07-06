import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAiHostingQuotaCacheForTest } from "@/pages/chat/ai-hosting/ai-hosting-quota-store";
import { getAiHostingQuota } from "@/pages/chat/ai-hosting/agent-service";
import { importKbImageDoc } from "@/pages/chat/ai-hosting/api/kb-doc-service";
import { ImportImageDialog } from "@/pages/chat/ai-hosting/kb-components/import-image-dialog";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

vi.mock("@/pages/chat/ai-hosting/agent-service", () => ({
  getAiHostingQuota: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/api/kb-doc-service", () => ({
  importKbImageDoc: vi.fn(),
}));

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: vi.fn(),
      success: vi.fn(),
    },
  };
});

describe("ImportImageDialog", () => {
  beforeEach(() => {
    resetAiHostingQuotaCacheForTest();
    vi.mocked(getAiHostingQuota).mockResolvedValue(createQuota());
    vi.mocked(importKbImageDoc).mockResolvedValue({ docId: "image-doc-1" });
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:mock-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    installImageMock();
  });

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
    vi.unstubAllGlobals();
  });

  it("submits selected image knowledge with the selected file and metadata", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const imageFile = new File(["image"], "商品主图.png", { type: "image/png" });

    renderDialog({ onCreated, onOpenChange });

    await user.upload(screen.getByLabelText("选择图片知识文件"), imageFile);
    await user.type(screen.getByLabelText(/图片描述/), "晨间护肤套装商品主图");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(importKbImageDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "晨间护肤套装商品主图",
          file: imageFile,
          kbId: "kb-1",
          name: "商品主图",
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(onCreated).toHaveBeenCalledWith({
      docId: "image-doc-1",
      docSuffix: "png",
      name: "商品主图",
      url: "",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks submit when the image exceeds remaining knowledge storage", async () => {
    const user = userEvent.setup();

    vi.mocked(getAiHostingQuota).mockResolvedValueOnce(createQuota({
      limit: 10,
      used: 8,
    }));
    renderDialog();

    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );
    await user.type(screen.getByLabelText(/图片描述/), "晨间护肤套装商品主图");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库存储空间已达上限");
    });
    expect(importKbImageDoc).not.toHaveBeenCalled();
  });

  it("accepts supported image extensions when the MIME type is empty", async () => {
    const user = userEvent.setup();

    renderDialog();

    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "商品主图.png"),
    );

    expect(screen.getByRole("region", { name: "已选择图片" })).toHaveTextContent(
      "商品主图.png",
    );
    expect(screen.queryByText("仅支持 jpg、jpeg、png、webp 格式的图片")).not.toBeInTheDocument();
  });

  it("rejects image knowledge files larger than 5MB", async () => {
    const user = userEvent.setup();

    renderDialog();

    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "超大图片.png", {
        type: "image/png",
      }),
    );

    expect(await screen.findByText("图片大小不能超过 5MB")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
  });

  it("rejects image knowledge files outside the allowed dimensions", async () => {
    const user = userEvent.setup();

    installImageMock({ height: 9, width: 800 });
    renderDialog();

    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "尺寸过小.png", { type: "image/png" }),
    );

    expect(await screen.findByText("图片宽高必须在 10 到 6000 像素范围内")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
  });

  it("ignores stale image validation after a later invalid file is selected", async () => {
    const user = userEvent.setup();
    let resolvePendingImageLoad: (() => void) | undefined;

    installImageMock({
      autoLoad: false,
      onPendingLoad: (resolve) => {
        resolvePendingImageLoad = resolve;
      },
    });
    renderDialog();

    const fileInput = screen.getByLabelText("选择图片知识文件");

    await user.upload(
      fileInput,
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );

    expect(screen.getByText("正在校验图片")).toBeInTheDocument();

    await user.upload(
      fileInput,
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "超大图片.png", {
        type: "image/png",
      }),
    );

    expect(await screen.findByText("图片大小不能超过 5MB")).toBeInTheDocument();
    expect(screen.queryByText("正在校验图片")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();

    resolvePendingImageLoad?.();
    await Promise.resolve();

    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
  });
});

function renderDialog({
  onCreated = vi.fn(),
  onOpenChange = vi.fn(),
}: {
  onCreated?: (result: {
    docId: string;
    docSuffix: string;
    name: string;
    url: string;
  }) => void;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  render(
    <ImportImageDialog
      kbId="kb-1"
      onCreated={onCreated}
      onOpenChange={onOpenChange}
      open
    />,
  );
}

function createQuota(kbDocs: { limit: number; used: number } = {
  limit: 1024 * 1024 * 1024,
  used: 20 * 1024 * 1024,
}) {
  return {
    agents: {
      limit: 20,
      used: 2,
    },
    kbDocs,
    kbs: {
      limit: 20,
      used: 3,
    },
  };
}

function installImageMock({
  autoLoad = true,
  height = 800,
  onPendingLoad,
  width = 800,
}: {
  autoLoad?: boolean;
  height?: number;
  onPendingLoad?: (resolve: () => void) => void;
  width?: number;
} = {}) {
  vi.stubGlobal(
    "Image",
    class {
      naturalHeight = height;
      naturalWidth = width;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      set src(_value: string) {
        const resolve = () => {
          this.onload?.();
        };

        if (autoLoad) {
          queueMicrotask(resolve);
          return;
        }

        onPendingLoad?.(resolve);
      }
    },
  );
}
