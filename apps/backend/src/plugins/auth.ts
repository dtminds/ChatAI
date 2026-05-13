import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { FastifyRequest } from "fastify";
import type { JwtUser } from "@chatai/contracts";
import { ForbiddenError, UnauthorizedError } from "../shared/errors.js";
import { verifyAccessSession } from "../modules/auth/auth.service.js";
import { ACCESS_TOKEN_COOKIE_NAME, readAuthCookie } from "../modules/auth/auth-cookies.js";

const mutatingMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);
const expectedWorkbenchClient = "chat-ai-ui";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: import("fastify").preHandlerHookHandler;
  }
}

function getJwtSecret() {
  const publicKey = process.env.JWT_PUBLIC_KEY;
  const privateKey = process.env.JWT_PRIVATE_KEY;

  if (publicKey && privateKey) {
    return {
      private: privateKey,
      public: publicKey,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT keys must be configured in production mode.");
  }

  return process.env.JWT_DEV_SECRET ?? "dev-only-change-me";
}

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: getJwtSecret(),
    sign: {
      aud: process.env.JWT_AUDIENCE ?? "chatai-workbench-web",
      expiresIn: "20m",
      iss: process.env.JWT_ISSUER ?? "chatai-workbench",
    },
    verify: {
      allowedAud: process.env.JWT_AUDIENCE ?? "chatai-workbench-web",
      allowedIss: process.env.JWT_ISSUER ?? "chatai-workbench",
    },
  });

  app.decorate("authenticate", async (request) => {
    let authenticatedWithCookie = false;

    try {
      const accessToken = readAuthCookie(request, ACCESS_TOKEN_COOKIE_NAME);

      if (accessToken && !request.headers.authorization) {
        request.user = app.jwt.verify<JwtUser>(accessToken);
        authenticatedWithCookie = true;
      } else {
        await request.jwtVerify();
      }
    } catch {
      throw new UnauthorizedError();
    }

    if (!app.db || !(await verifyAccessSession(app.db, request.user))) {
      throw new UnauthorizedError();
    }

    if (authenticatedWithCookie && isMutatingRequest(request) && !hasWorkbenchClientHeader(request)) {
      throw new ForbiddenError("CSRF_PROTECTION_FAILED", "请求来源校验失败");
    }
  });
});

function isMutatingRequest(request: FastifyRequest) {
  return mutatingMethods.has(request.method.toUpperCase());
}

function hasWorkbenchClientHeader(request: FastifyRequest) {
  return request.headers["x-workbench-client"] === expectedWorkbenchClient;
}
