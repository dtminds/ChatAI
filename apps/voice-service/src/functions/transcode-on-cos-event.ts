import { createCosClientFromEnv, fetchCosObject, putCosObject } from "../shared/cos.js";
import { readVoiceServiceConfig } from "../shared/config.js";
import {
  buildPlayableObjectKey,
  detectVoiceFormat,
  isAllowedSourceObject,
} from "../shared/media-sniff.js";
import { transcodeVoiceToWav } from "../shared/transcode.js";

type CosObjectEvent = {
  Records?: Array<{
    cos?: {
      cosBucket?: {
        name?: string;
      };
      cosObject?: {
        key?: string;
      };
      cosRegion?: {
        appid?: string;
        region?: string;
      };
    };
  }>;
};

export async function main_handler(event: CosObjectEvent) {
  const config = readVoiceServiceConfig();
  const client = createCosClientFromEnv();
  const record = event.Records?.[0];
  const bucket = normalizeEventBucket(
    record?.cos?.cosBucket?.name,
    record?.cos?.cosRegion?.appid,
    config.bucket,
  );
  const region = record?.cos?.cosRegion?.region ?? "ap-shanghai";
  const key = normalizeEventObjectKey(
    decodeURIComponent(record?.cos?.cosObject?.key ?? ""),
    record?.cos?.cosBucket?.name,
    bucket,
  );

  if (bucket !== config.bucket) {
    throw new Error(`Unexpected bucket: ${bucket}`);
  }

  if (!isAllowedSourceObject(key)) {
    throw new Error(`Unexpected source key: ${key}`);
  }

  const source = await fetchCosObject(client, bucket, region, key);
  const detected = detectVoiceFormat(source.body);

  if (detected.format !== "silk-v3" && detected.format !== "amr-nb" && detected.format !== "amr-wb") {
    throw new Error(`Unsupported voice format: ${detected.format}`);
  }

  const playableKey = buildPlayableObjectKey(key);
  const transcoded = await transcodeVoiceToWav(source.body, {
    maxBytes: config.maxBytes,
    maxDurationMs: config.maxDurationMs,
    sampleRate: config.sampleRate,
  });

  await putCosObject(client, bucket, region, playableKey, transcoded.wav);

  return {
    bucket,
    contentType: transcoded.contentType,
    durationMs: transcoded.durationMs,
    format: transcoded.format,
    key,
    playableKey,
  };
}

function normalizeEventBucket(
  bucketName: string | undefined,
  appid: string | undefined,
  fallbackBucket: string,
) {
  if (!bucketName) {
    return fallbackBucket;
  }

  if (bucketName === fallbackBucket) {
    return bucketName;
  }

  if (bucketName === getBucketBaseName(fallbackBucket)) {
    return fallbackBucket;
  }

  if (!appid) {
    return bucketName;
  }

  const appidSuffix = `-${appid}`;

  return bucketName.endsWith(appidSuffix) ? bucketName : `${bucketName}${appidSuffix}`;
}

function getBucketBaseName(bucket: string) {
  return bucket.replace(/-\d+$/, "");
}

function normalizeEventObjectKey(
  objectKey: string,
  eventBucketName: string | undefined,
  bucket: string,
) {
  const normalizedKey = objectKey.replace(/^\/+/, "");
  const bucketNames = [
    eventBucketName,
    bucket,
    getBucketBaseName(bucket),
  ].filter((value): value is string => Boolean(value));

  for (const bucketName of bucketNames) {
    const marker = `/${bucketName}/`;
    const markerIndex = normalizedKey.indexOf(marker);

    if (markerIndex >= 0) {
      return normalizedKey.slice(markerIndex + marker.length);
    }

    if (normalizedKey.startsWith(`${bucketName}/`)) {
      return normalizedKey.slice(bucketName.length + 1);
    }
  }

  return normalizedKey;
}
