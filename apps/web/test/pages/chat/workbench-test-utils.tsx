import MockAdapter from "axios-mock-adapter";
import { toast } from "sonner";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { requestInstance } from "@/lib/request";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import { resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";

export const workbenchHttpMock = new MockAdapter(requestInstance);

const mediaUploadMocks = vi.hoisted(() => ({
  resolveImageSegmentsForSend: vi.fn(
    async (_conversationId: string, segments: ComposerSegment[]) =>
      segments.map((segment: ComposerSegment) =>
        segment.type === "image"
          ? {
              alt: segment.alt,
              fileId: "chat-images/conv-001/mock-image.png",
              height: segment.height,
              type: "image",
              url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/mock-image.png",
              width: segment.width,
            }
          : segment,
      ),
  ),
  uploadWorkbenchFile: vi.fn(
    async (
      _conversationId: string,
      file: File,
      _options?: {
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
      },
    ) => ({
      extension: file.name.split(".").pop() ?? "",
      fileId: `chat-files/conv-001/${file.name}`,
      fileName: file.name,
      fileSize: file.size,
      fileSizeLabel: `${file.size} B`,
      type: "file",
      url: `https://b5.bokr.com.cn/chat-files/conv-001/${file.name}`,
    }),
  ),
}));

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      warning: vi.fn(),
    },
  };
});

vi.mock("@/pages/chat/api/media-upload-service", () => mediaUploadMocks);

export function renderChatWorkbenchPage() {
  return render(<ChatWorkbenchPage />);
}

export function installChatWorkbenchTestEnvironment() {
  // Shared setup lives in setup.ts and resetChatWorkbenchTestState().
}

export function resetChatWorkbenchTestState() {
  workbenchHttpMock.reset();
  resetWorkbenchService();
  vi.mocked(mediaUploadMocks.resolveImageSegmentsForSend).mockImplementation(
    async (_conversationId, segments) =>
      segments.map((segment: ComposerSegment) =>
        segment.type === "image"
          ? {
              alt: segment.alt,
              fileId: "chat-images/conv-001/mock-image.png",
              height: segment.height,
              type: "image",
              url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/mock-image.png",
              width: segment.width,
            }
          : segment,
      ),
  );
  vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mockImplementation(
    async (_conversationId, file: File, _options) => ({
      extension: file.name.split(".").pop() ?? "",
      fileId: `chat-files/conv-001/${file.name}`,
      fileName: file.name,
      fileSize: file.size,
      fileSizeLabel: `${file.size} B`,
      type: "file",
      url: `https://b5.bokr.com.cn/chat-files/conv-001/${file.name}`,
    }),
  );
  vi.mocked(toast.warning).mockClear();
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
}

export {
  mediaUploadMocks,
};

export { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
