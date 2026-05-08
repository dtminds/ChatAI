import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { JwtUser } from "@chatai/contracts";
import { UnauthorizedError } from "../shared/errors.js";

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

function isDevelopmentAuthBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.AUTH_DEV_BYPASS === "true";
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
    if (isDevelopmentAuthBypassEnabled()) {
      request.user = {
        employeeId: process.env.AUTH_DEV_EMPLOYEE_ID ?? "emp-001",
        roles: ["agent"],
      };
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError();
    }
  });
});
