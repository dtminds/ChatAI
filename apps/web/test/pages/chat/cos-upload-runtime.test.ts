import { describe, expect, it, vi } from "vitest";
import { uploadCosFile } from "@/pages/chat/lib/cos-upload-runtime";

type UploadCosFileOptions = Parameters<typeof uploadCosFile>[0];
type CapturedUploadParams = {
  onTaskReady?: (taskId: string) => void;
};

describe("uploadCosFile", () => {
  it("does not start an upload for an already-aborted signal", async () => {
    const uploadFile = vi.fn();
    const { cancelTask, cos } = createCosMock(uploadFile);
    const controller = new AbortController();
    controller.abort();

    await expect(startUpload(cos, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(cancelTask).not.toHaveBeenCalled();
  });

  it("cancels a task created after the signal aborts", async () => {
    const uploadGate = createDeferred();
    let uploadParams: CapturedUploadParams | undefined;
    const uploadFile = vi.fn((params: CapturedUploadParams) => {
      uploadParams = params;
      return uploadGate.promise;
    });
    const { cancelTask, cos } = createCosMock(uploadFile);
    const controller = new AbortController();

    const uploadPromise = startUpload(cos, controller.signal);
    expect(uploadFile).toHaveBeenCalledTimes(1);

    controller.abort();
    expect(cancelTask).not.toHaveBeenCalled();

    uploadParams?.onTaskReady?.("cos-task-late");
    expect(cancelTask).toHaveBeenCalledWith("cos-task-late");

    uploadGate.resolve();
    await expect(uploadPromise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels an active task when the signal aborts", async () => {
    const uploadGate = createDeferred();
    const uploadFile = vi.fn((params: CapturedUploadParams) => {
      params.onTaskReady?.("cos-task-active");
      return uploadGate.promise;
    });
    const { cancelTask, cos } = createCosMock(uploadFile);
    const controller = new AbortController();

    const uploadPromise = startUpload(cos, controller.signal);
    controller.abort();

    expect(cancelTask).toHaveBeenCalledWith("cos-task-active");

    uploadGate.resolve();
    await expect(uploadPromise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not cancel a completed upload when the signal later aborts", async () => {
    const uploadFile = vi.fn(async (params: CapturedUploadParams) => {
      params.onTaskReady?.("cos-task-complete");
    });
    const { cancelTask, cos } = createCosMock(uploadFile);
    const controller = new AbortController();

    await expect(startUpload(cos, controller.signal)).resolves.toBeUndefined();
    controller.abort();

    expect(cancelTask).not.toHaveBeenCalled();
  });
});

function startUpload(
  cos: UploadCosFileOptions["cos"],
  signal: AbortSignal,
) {
  return uploadCosFile({
    body: new Blob(["upload-bytes"]),
    contentType: "application/octet-stream",
    cos,
    credential: {
      bucket: "mock-bucket",
      region: "ap-guangzhou",
    },
    key: "chat-files/mock.bin",
    signal,
  });
}

function createCosMock(uploadFile: ReturnType<typeof vi.fn>) {
  const cancelTask = vi.fn();
  const cos = {
    cancelTask,
    uploadFile,
  } as unknown as UploadCosFileOptions["cos"];

  return { cancelTask, cos };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}
