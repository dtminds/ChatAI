import COS from "cos-nodejs-sdk-v5";
import { Readable } from "node:stream";

export type CosClient = Pick<
  COS,
  "getObject" | "headObject" | "putObject" | "getObjectUrl"
> & {
  options?: {
    SecretId?: string;
    SecretKey?: string;
    XCosSecurityToken?: string;
  };
};

export type VoiceObjectMetadata = {
  contentLength?: string;
  contentType?: string;
};

export function createCosClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const secretId = env.TENCENTCLOUD_SECRETID ?? env.TENCENT_SECRET_ID;
  const secretKey = env.TENCENTCLOUD_SECRETKEY ?? env.TENCENT_SECRET_KEY;
  const securityToken = env.TENCENTCLOUD_SESSIONTOKEN;

  if (!secretId || !secretKey) {
    throw new Error(
      "Missing COS credentials: expected SCF runtime role variables TENCENTCLOUD_SECRETID/TENCENTCLOUD_SECRETKEY or manual TENCENT_SECRET_ID/TENCENT_SECRET_KEY",
    );
  }

  return new COS({
    SecretId: secretId,
    SecretKey: secretKey,
    XCosSecurityToken: securityToken,
  }) as CosClient;
}

export async function fetchCosObject(
  client: CosClient,
  bucket: string,
  region: string,
  key: string,
) {
  const response = await client.getObject({ Bucket: bucket, Region: region, Key: key });
  const body = await toUint8Array(response.Body);

  return {
    body,
    metadata: {
      contentLength:
        typeof response.headers?.["content-length"] === "string"
          ? response.headers["content-length"]
          : undefined,
      contentType:
        typeof response.headers?.["content-type"] === "string"
          ? response.headers["content-type"]
          : undefined,
    } satisfies VoiceObjectMetadata,
  };
}

export async function headCosObject(
  client: CosClient,
  bucket: string,
  region: string,
  key: string,
) {
  const response = await client.headObject({ Bucket: bucket, Region: region, Key: key });

  return {
    contentLength:
      typeof response.headers?.["content-length"] === "string"
        ? response.headers["content-length"]
        : undefined,
    contentType:
      typeof response.headers?.["content-type"] === "string"
        ? response.headers["content-type"]
        : undefined,
  } satisfies VoiceObjectMetadata;
}

export async function putCosObject(
  client: CosClient,
  bucket: string,
  region: string,
  key: string,
  body: Uint8Array,
) {
  await client.putObject({
    Body: Buffer.from(body),
    Bucket: bucket,
    ContentType: "audio/wav",
    Region: region,
    Key: key,
  });
}

async function toUint8Array(body: unknown) {
  if (body instanceof Uint8Array) {
    return new Uint8Array(body);
  }

  if (Buffer.isBuffer(body)) {
    return new Uint8Array(body);
  }

  return streamToUint8Array(body as NodeJS.ReadableStream);
}

function streamToUint8Array(stream: NodeJS.ReadableStream) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    stream.on("error", reject);
  });
}
