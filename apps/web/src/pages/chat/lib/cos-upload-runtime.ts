import type COS from "cos-js-sdk-v5";
import {
  createCosClientOptions,
  type CosUploadCredential,
} from "@/lib/cos-dev-proxy";
import {
  MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE,
  MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE,
} from "@/pages/chat/api/media-upload-errors";

export const COS_UPLOAD_SLICE_SIZE = 1024 * 1024;

type CosConstructor = typeof COS;
type CosClient = InstanceType<CosConstructor>;
type CosModule = Awaited<ReturnType<typeof importCosModule>>;

let cosConstructorPromise: Promise<CosConstructor> | null = null;

export async function createCosClient(credential: CosUploadCredential) {
  const COS = await loadCosConstructor();

  return new COS(createCosClientOptions(COS, credential));
}

export async function uploadCosFile({
  body,
  contentType,
  cos,
  credential,
  key,
  onProgress,
  signal,
}: {
  body: Blob;
  contentType?: string;
  cos: CosClient;
  credential: Pick<CosUploadCredential, "bucket" | "region">;
  key: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}) {
  let taskId: string | undefined;
  const abortUploadTask = () => {
    if (taskId) {
      cos.cancelTask(taskId);
    }
  };

  if (signal?.aborted) {
    throw createUploadAbortError();
  }

  signal?.addEventListener("abort", abortUploadTask, { once: true });

  try {
    await cos.uploadFile({
      Body: body,
      Bucket: credential.bucket,
      ContentType: contentType || undefined,
      Key: key,
      Region: credential.region,
      SliceSize: COS_UPLOAD_SLICE_SIZE,
      onProgress(progressData: COS.ProgressInfo) {
        onProgress?.(Math.round((progressData.percent ?? 0) * 100));
      },
      onTaskReady(nextTaskId: COS.TaskId) {
        taskId = nextTaskId;
        if (signal?.aborted) {
          cos.cancelTask(nextTaskId);
        }
      },
    });
  } catch (error) {
    if (signal?.aborted) {
      throw createUploadAbortError();
    }

    throw error;
  } finally {
    signal?.removeEventListener("abort", abortUploadTask);
  }

  if (signal?.aborted) {
    throw createUploadAbortError();
  }

  onProgress?.(100);
}

function createUploadAbortError() {
  return new DOMException("文件上传已取消", "AbortError");
}

async function loadCosConstructor() {
  cosConstructorPromise ??= importCosModule()
    .then((module) => getCosConstructor(module))
    .catch((error: unknown) => {
      cosConstructorPromise = null;
      if (isDynamicImportFailure(error)) {
        throw new MediaUploadSdkLoadError(error);
      }

      throw error;
    });

  return cosConstructorPromise;
}

function importCosModule() {
  return import("cos-js-sdk-v5");
}

function getCosConstructor(module: CosModule): CosConstructor {
  return (
    "default" in module && module.default ? module.default : module
  ) as CosConstructor;
}

class MediaUploadSdkLoadError extends Error {
  readonly code = MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE;

  constructor(cause: unknown) {
    super(MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE);
    this.name = "MediaUploadSdkLoadError";
    this.cause = cause;
  }
}

function isDynamicImportFailure(error: unknown) {
  const messages = collectErrorMessages(error);

  return messages.some((message) => {
    const normalized = message.toLowerCase();

    return (
      normalized.includes("failed to fetch dynamically imported module") ||
      normalized.includes("error loading dynamically imported module") ||
      normalized.includes("importing a module script failed") ||
      normalized.includes("loading chunk") ||
      normalized.includes("chunkloaderror")
    );
  });
}

function collectErrorMessages(error: unknown): string[] {
  if (typeof error === "string") {
    return [error];
  }

  if (!error || typeof error !== "object") {
    return [];
  }

  const messages: string[] = [];
  const message = "message" in error
    ? (error as { message: unknown }).message
    : undefined;

  if (typeof message === "string") {
    messages.push(message);
  }

  if ("cause" in error) {
    messages.push(...collectErrorMessages(error.cause));
  }

  return messages;
}
