import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestSmartsheetBytes, smartsheetPublicLookup } from "../src/smartsheet-http.js";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));

describe("smartsheet bounded public HTTP transport", () => {
  beforeEach(() => vi.resetAllMocks());

  it("pins the validated DNS result and rejects mixed public/private answers", async () => {
    const lookup = () => new Promise((resolve, reject) => smartsheetPublicLookup("example.com", { all: true }, (error, addresses) => {
      if (error) reject(error); else resolve(addresses);
    }));
    mocks.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]);
    await expect(lookup()).resolves.toEqual([{ address: "8.8.8.8", family: 4 }]);
    mocks.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    await expect(lookup()).rejects.toThrow("not public");
    mocks.lookup.mockRejectedValueOnce(new Error("DNS failure"));
    await expect(lookup()).rejects.toThrow("resolution failed");
  });

  it("passes cancellation and pinned lookup to the socket and enforces actual streamed byte count", async () => {
    const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
    mocks.request.mockImplementation((_url, _options, receive) => {
      const req = Object.assign(new EventEmitter(), { end: () => receive(response) });
      return req;
    });
    const signal = new AbortController().signal;
    const result = requestSmartsheetBytes({ url: "https://example.com/image", method: "GET", maxBytes: 4, signal });
    expect(mocks.request.mock.calls[0]![1]).toMatchObject({ lookup: smartsheetPublicLookup, signal, agent: false });
    const rejection = expect(result).rejects.toThrow("too large");
    response.write(Buffer.from("123"));
    response.write(Buffer.from("45"));
    await rejection;
    expect(response.destroyed).toBe(true);
  });

  it("rejects redirects and oversized declared lengths without following or buffering them", async () => {
    for (const metadata of [
      { statusCode: 302, headers: { location: "http://169.254.169.254/" } },
      { statusCode: 200, headers: { "content-length": "100" } },
    ]) {
      const response = Object.assign(new PassThrough(), metadata);
      mocks.request.mockImplementation((_url, _options, receive) => Object.assign(new EventEmitter(), { end: () => receive(response) }));
      await expect(requestSmartsheetBytes({ url: "https://example.com/image", method: "GET", maxBytes: 4, signal: new AbortController().signal })).rejects.toThrow("rejected");
      expect(response.destroyed).toBe(true);
    }
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
