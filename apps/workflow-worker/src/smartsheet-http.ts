import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import type { LookupFunction } from "node:net";

const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blockedV4.addSubnet(address, prefix);
const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
blockedV6.addSubnet("2001::", 23, "ipv6");
blockedV6.addSubnet("2001:db8::", 32, "ipv6");
blockedV6.addSubnet("2002::", 16, "ipv6");
blockedV6.addSubnet("3fff::", 20, "ipv6");

export function isSmartsheetPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blockedV4.check(address)
    : family === 6 && publicV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
}

// Resolve inside the socket lookup, so validation and connection use the same addresses.
export const smartsheetPublicLookup: LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { all: true }).then(addresses => {
    if (!addresses.length || addresses.some(item => !isSmartsheetPublicAddress(item.address))) {
      callback(new Error("Image host is not public"), "", 4);
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  }, () => callback(new Error("Image host resolution failed"), "", 4));
};

export type SmartsheetHttpRequest = {
  url: string;
  method: "GET" | "POST";
  body?: string;
  maxBytes: number;
  signal: AbortSignal;
};

export function requestSmartsheetBytes(input: SmartsheetHttpRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port
      || (isIP(hostname) && !isSmartsheetPublicAddress(hostname))) {
      reject(new Error("Unsupported remote address"));
      return;
    }
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(url, {
      agent: false,
      lookup: smartsheetPublicLookup,
      method: input.method,
      signal: input.signal,
      headers: input.body === undefined ? { Accept: "image/*" } : {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(input.body),
      },
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("error", reject);
      // Redirects are deliberately unsupported: only directly downloadable public URLs.
      if (response.statusCode !== 200 || Number(response.headers["content-length"]) > input.maxBytes) {
        response.destroy(new Error("Remote response rejected"));
        return;
      }
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > input.maxBytes) response.destroy(new Error("Remote response too large"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.end(input.body);
  });
}
