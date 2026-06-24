import { describe, expect, it } from "vitest";
import {
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
});
