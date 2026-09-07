export type SmartsheetHttpRequest = {
  url: string;
  method: "GET" | "POST";
  body?: string;
  maxBytes: number;
  signal: AbortSignal;
};

export async function requestSmartsheetBytes(input: SmartsheetHttpRequest): Promise<Buffer> {
  const url = new URL(input.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Unsupported remote address");
  }
  if (input.method === "POST" && url.hostname !== "qyapi.weixin.qq.com") {
    throw new Error("Unsupported webhook host");
  }
  const response = await fetch(url, {
    body: input.body,
    headers: input.body === undefined
      ? { accept: "image/*" }
      : { "content-type": "application/json" },
    method: input.method,
    redirect: "error",
    signal: input.signal,
  });
  if (!response.ok) throw new Error(`Remote response returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > input.maxBytes) {
    throw new Error("Remote response too large");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > input.maxBytes) throw new Error("Remote response too large");
  return bytes;
}
