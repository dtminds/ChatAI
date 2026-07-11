import { createServer, type Server } from "node:http";

export type WorkflowReadiness = {
  broker: boolean;
  database: boolean;
  roles: Record<string, boolean>;
};

export function startWorkflowHealthServer(input: {
  getReadiness(): WorkflowReadiness;
  port: number;
}): Promise<{ close(): Promise<void>; server: Server }> {
  const server = createServer((request, response) => {
    if (request.url === "/healthz") {
      respond(response, 200, { status: "ok" });
      return;
    }
    if (request.url === "/readyz") {
      const readiness = input.getReadiness();
      const ready = readiness.broker
        && readiness.database
        && Object.values(readiness.roles).every(Boolean);
      respond(response, ready ? 200 : 503, { ...readiness, status: ready ? "ready" : "not-ready" });
      return;
    }
    respond(response, 404, { status: "not-found" });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, () => {
      server.off("error", reject);
      resolve({
        close: () => new Promise<void>((closeResolve, closeReject) => {
          server.close(error => error ? closeReject(error) : closeResolve());
        }),
        server,
      });
    });
  });
}

function respond(response: import("node:http").ServerResponse, statusCode: number, value: object) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
