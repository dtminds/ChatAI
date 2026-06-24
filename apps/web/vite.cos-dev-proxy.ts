import https from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export const COS_DEV_PROXY_PREFIX = "/__cos";

export function parseCosDevProxyRequest(pathname: string) {
  const match = pathname.match(/^\/__cos\/([^/?#]+)(.*)$/);

  if (!match?.[1]) {
    return null;
  }

  const rewrittenPath = match[2] || "/";
  let hostPart: string;

  try {
    hostPart = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  return {
    rewrittenPath: rewrittenPath.startsWith("/") ? rewrittenPath : `/${rewrittenPath}`,
    target: `https://${hostPart}`,
  };
}

export function rewriteCosDevProxyPath(pathname: string) {
  return parseCosDevProxyRequest(pathname)?.rewrittenPath ?? pathname;
}

export function resolveCosDevProxyTarget(pathname: string) {
  return parseCosDevProxyRequest(pathname)?.target;
}

export function createCosDevProxyMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: (error?: Error) => void) => {
    const pathname = req.url ?? "";

    if (!pathname.startsWith(`${COS_DEV_PROXY_PREFIX}/`)) {
      next();
      return;
    }

    const parsed = parseCosDevProxyRequest(pathname);

    if (!parsed) {
      res.statusCode = 400;
      res.end("Invalid COS proxy path");
      return;
    }

    let targetBase: URL;

    try {
      targetBase = new URL(parsed.target);
    } catch {
      res.statusCode = 400;
      res.end("Invalid COS proxy target URL");
      return;
    }

    const requestHeaders = { ...req.headers, host: targetBase.host };
    delete requestHeaders.connection;

    const abortProxy = () => {
      if (!proxyReq.destroyed) {
        proxyReq.destroy();
      }
    };

    const proxyReq = https.request(
      {
        headers: requestHeaders,
        hostname: targetBase.hostname,
        method: req.method,
        // Keep the original query ordering; URL() would reorder COS query params and break signatures.
        path: parsed.rewrittenPath,
        port: targetBase.port || 443,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.on("error", () => {
          if (!res.headersSent) {
            res.statusCode = 502;
          }

          if (!res.writableEnded) {
            res.end();
          }
        });
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", (error) => {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end();
      }

      next(error);
    });

    // `close` fires after the request body is fully read; using it would abort COS
    // uploads immediately after the client finishes sending (including empty POST).
    req.on("aborted", abortProxy);
    res.on("close", () => {
      if (!res.writableEnded) {
        abortProxy();
      }
    });

    req.pipe(proxyReq);
  };
}

export function cosDevProxyPlugin(): Plugin {
  return {
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createCosDevProxyMiddleware());
    },
    name: "cos-dev-proxy",
  };
}
