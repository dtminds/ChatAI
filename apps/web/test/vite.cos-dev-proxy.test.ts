import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createCosDevProxyMiddleware,
  parseCosDevProxyRequest,
  rewriteCosDevProxyPath,
  resolveCosDevProxyTarget,
} from "../vite.cos-dev-proxy";

describe("vite.cos-dev-proxy", () => {
  it("preserves cos query parameter order for signature validation", () => {
    const pathname =
      "/__cos/scrm-msg-audit-1304132716.cos.ap-shanghai.myqcloud.com/?uploads&prefix=s5%2Fupload%2F2026%2F06%2F23%2F272%2Fdemo.pdf";

    expect(rewriteCosDevProxyPath(pathname)).toBe(
      "/?uploads&prefix=s5%2Fupload%2F2026%2F06%2F23%2F272%2Fdemo.pdf",
    );
    expect(parseCosDevProxyRequest(pathname)).toEqual({
      rewrittenPath:
        "/?uploads&prefix=s5%2Fupload%2F2026%2F06%2F23%2F272%2Fdemo.pdf",
      target: "https://scrm-msg-audit-1304132716.cos.ap-shanghai.myqcloud.com",
    });
    expect(resolveCosDevProxyTarget(pathname)).toBe(
      "https://scrm-msg-audit-1304132716.cos.ap-shanghai.myqcloud.com",
    );
  });

  it("must forward the raw path without URL normalization", () => {
    const rewrittenPath = rewriteCosDevProxyPath(
      "/__cos/examplebucket-1250000000.cos.ap-guangzhou.myqcloud.com/?uploads&prefix=a%2Fb.pdf",
    );

    expect(rewrittenPath).toBe("/?uploads&prefix=a%2Fb.pdf");
    expect(rewrittenPath).not.toContain("prefix=a%2Fb.pdf&uploads=");
  });

  it("returns 400 for malformed proxy target URLs", () => {
    const middleware = createCosDevProxyMiddleware();
    const res = {
      end: vi.fn(),
      statusCode: 200,
      writeHead: vi.fn(),
    };
    const next = vi.fn();

    middleware(
      {
        url: "/__cos/not%20a%20valid%20host/demo.pdf",
      } as never,
      res as never,
      next,
    );

    expect(res.statusCode).toBe(400);
    expect(res.end).toHaveBeenCalledWith("Invalid COS proxy target URL");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid encoded proxy paths", () => {
    const middleware = createCosDevProxyMiddleware();
    const res = {
      end: vi.fn(),
      statusCode: 200,
      writeHead: vi.fn(),
    };
    const next = vi.fn();

    middleware(
      {
        url: "/__cos/%",
      } as never,
      res as never,
      next,
    );

    expect(res.statusCode).toBe(400);
    expect(res.end).toHaveBeenCalledWith("Invalid COS proxy path");
    expect(next).not.toHaveBeenCalled();
  });

  it("destroys the proxy request when the client closes the connection", async () => {
    const proxyReq = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    const https = await import("node:https");
    const requestSpy = vi.spyOn(https.default, "request").mockReturnValue(proxyReq as never);
    const middleware = createCosDevProxyMiddleware();
    const req = Object.assign(new EventEmitter(), {
      headers: {},
      pipe: vi.fn(),
      url: "/__cos/examplebucket-1250000000.cos.ap-guangzhou.myqcloud.com/demo.pdf",
    });

    try {
      middleware(
        req as never,
        { end: vi.fn(), statusCode: 200, writeHead: vi.fn() } as never,
        vi.fn(),
      );

      req.emit("close");

      expect(proxyReq.destroy).toHaveBeenCalled();
    } finally {
      requestSpy.mockRestore();
    }
  });
});
