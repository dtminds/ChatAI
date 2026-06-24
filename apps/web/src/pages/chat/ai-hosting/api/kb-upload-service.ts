import type COS from "cos-js-sdk-v5";
import type {
  ApiSuccessEnvelope,
  KbDocUploadCredentialResponse,
} from "@chatai/contracts";
import {
  createCosClientOptions,
} from "@/lib/cos-dev-proxy";
import { buildMediaAssetUrl } from "@/lib/media-asset-url";
import { request } from "@/lib/request";
import {
  MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE,
  MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE,
} from "@/pages/chat/api/media-upload-errors";
import { getFileExtension } from "@/pages/chat/ai-hosting/kb-components/shared";

const DEFAULT_FALLBACK_EXTENSION = "bin";
const UPLOAD_SLICE_SIZE = 1024 * 1024;

type CosConstructor = typeof COS;
type CosClient = InstanceType<CosConstructor>;
type CosModule = Awaited<ReturnType<typeof importCosModule>>;

export type KbCosUploadResult = {
  docUrl: string;
  url: string;
};

let cosConstructorPromise: Promise<CosConstructor> | null = null;

export async function uploadKbDocFileToCos(
  file: File,
  options: KbCosUploadOptions = {},
): Promise<KbCosUploadResult> {
  const extension =
    getFileExtension(file.name).toLowerCase() || DEFAULT_FALLBACK_EXTENSION;

  return uploadFileToCos(file, extension, options);
}

export async function uploadKbImageToCos(
  file: File,
  options: KbCosUploadOptions = {},
): Promise<KbCosUploadResult> {
  const extension = getImageExtension(file.type) || DEFAULT_FALLBACK_EXTENSION;

  return uploadFileToCos(file, extension, options);
}

export async function uploadKbQaFileToCos(
  file: File,
  options: KbCosUploadOptions = {},
): Promise<KbCosUploadResult> {
  const extension = getKbQaUploadExtension(file.name);

  return uploadFileToCos(file, extension, options);
}

type KbCosUploadOptions = {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

async function uploadFileToCos(
  file: File,
  extension: string,
  options: KbCosUploadOptions,
): Promise<KbCosUploadResult> {
  const credential = await fetchKbDocUploadCredential();
  const cos = await createCosClient(credential);
  const key = buildObjectKey({
    credential,
    extension,
  });
  let taskId: string | undefined;
  const abortUploadTask = () => {
    if (taskId) {
      cos.cancelTask(taskId);
    }
  };

  if (options.signal?.aborted) {
    throw createUploadAbortError();
  }

  options.signal?.addEventListener("abort", abortUploadTask, { once: true });

  try {
    await cos.uploadFile({
      Body: file,
      Bucket: credential.bucket,
      ContentType: file.type || undefined,
      Key: key,
      Region: credential.region,
      SliceSize: UPLOAD_SLICE_SIZE,
      onProgress(progressData: COS.ProgressInfo) {
        options.onProgress?.(Math.round((progressData.percent ?? 0) * 100));
      },
      onTaskReady(nextTaskId: COS.TaskId) {
        taskId = nextTaskId;
        if (options.signal?.aborted) {
          cos.cancelTask(nextTaskId);
        }
      },
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw createUploadAbortError();
    }

    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortUploadTask);
  }

  if (options.signal?.aborted) {
    throw createUploadAbortError();
  }

  options.onProgress?.(100);

  return {
    docUrl: key,
    url: buildObjectUrl(key),
  };
}

function createUploadAbortError() {
  return new DOMException("文件上传已取消", "AbortError");
}

async function createCosClient(
  credential: KbDocUploadCredentialResponse,
): Promise<CosClient> {
  const COS = await loadCosConstructor();

  return new COS(createCosClientOptions(COS, credential));
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

function buildObjectKey({
  credential,
  extension,
}: {
  credential: KbDocUploadCredentialResponse;
  extension: string;
}) {
  const prefix = resolveUploadPrefix(credential);
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${prefix}${Date.now()}-${randomPart}.${extension}`;
}

function resolveUploadPrefix(credential: KbDocUploadCredentialResponse) {
  const prefix = credential.allowPerfixs?.[0];

  if (!prefix?.trim()) {
    throw new Error("获取文件上传凭证失败：缺少允许路径");
  }

  return normalizeUploadPrefix(prefix);
}

function normalizeUploadPrefix(prefix: string) {
  const normalizedPrefix = prefix
    .trim()
    .replace(/^\/+/, "")
    .replace(/\*+$/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/");

  return `${normalizedPrefix}/`;
}

function getKbQaUploadExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();

  if (normalizedName.endsWith(".faq.xlsx")) {
    return "faq.xlsx";
  }

  return getFileExtension(fileName).toLowerCase() || DEFAULT_FALLBACK_EXTENSION;
}

function getImageExtension(contentType: string) {
  const [, rawSubtype] = contentType.split("/");
  const subtype = rawSubtype?.split(";")[0]?.trim().toLowerCase();

  if (!subtype) {
    return DEFAULT_FALLBACK_EXTENSION;
  }

  if (subtype === "jpeg") {
    return "jpg";
  }

  if (subtype.includes("+")) {
    return subtype.split("+")[0] || DEFAULT_FALLBACK_EXTENSION;
  }

  return subtype.replace(/[^a-z0-9]/g, "") || DEFAULT_FALLBACK_EXTENSION;
}

function buildObjectUrl(key: string) {
  return buildMediaAssetUrl(key);
}

async function fetchKbDocUploadCredential() {
  const response = await request<ApiSuccessEnvelope<KbDocUploadCredentialResponse>>({
    method: "POST",
    url: "/server/ai-hosting/kb-docs/upload-credential",
  });

  return response.data;
}
