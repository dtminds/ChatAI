import type COS from "cos-js-sdk-v5";

export const COS_DEV_PROXY_PREFIX = "/__cos";

type CosConstructor = typeof COS;

export type CosUploadCredential = {
  bucket: string;
  credentials: {
    sessionToken: string;
    tmpSecretId: string;
    tmpSecretKey: string;
    token?: string;
  };
  expiredTime: number;
  region: string;
  startTime: number;
};

export function isCosDevProxyEnabled() {
  if (import.meta.env.MODE === "test" || import.meta.env.VITE_COS_DEV_PROXY === "false") {
    return false;
  }

  return import.meta.env.DEV;
}

export function buildCosSignHost(credential: Pick<CosUploadCredential, "bucket" | "region">) {
  return `${credential.bucket}.cos.${credential.region}.myqcloud.com`;
}

export function buildCosClientConfig(credential: CosUploadCredential): COS.COSOptions {
  return {
    ExpiredTime: credential.expiredTime,
    SecretId: credential.credentials.tmpSecretId,
    SecretKey: credential.credentials.tmpSecretKey,
    SecurityToken:
      credential.credentials.sessionToken || credential.credentials.token,
    StartTime: credential.startTime,
  };
}

export function applyCosDevProxyClientOptions(
  COS: CosConstructor,
  credential: CosUploadCredential,
  config: COS.COSOptions,
): COS.COSOptions {
  if (typeof window === "undefined" || !isCosDevProxyEnabled()) {
    return config;
  }

  const signHost = buildCosSignHost(credential);

  return {
    ...config,
    Domain: `${window.location.host}${COS_DEV_PROXY_PREFIX}/{Bucket}.cos.{Region}.myqcloud.com`,
    Protocol: window.location.protocol,
    getAuthorization(options, callback) {
      const authorization = COS.getAuthorization({
        Headers: {
          ...options.Headers,
          Host: signHost,
        },
        KeyTime: `${credential.startTime};${credential.expiredTime}`,
        Method: options.Method,
        Pathname: options.Pathname,
        Query: options.Query,
        SecretId: credential.credentials.tmpSecretId,
        SecretKey: credential.credentials.tmpSecretKey,
      });

      callback({
        Authorization: authorization,
        SecurityToken:
          credential.credentials.sessionToken || credential.credentials.token || "",
      } as COS.GetAuthorizationCallbackParams);
    },
  };
}

export function createCosClientOptions(
  COS: CosConstructor,
  credential: CosUploadCredential,
) {
  return applyCosDevProxyClientOptions(
    COS,
    credential,
    buildCosClientConfig(credential),
  );
}
