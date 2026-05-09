import type { AuthLoginRequest, AuthLoginResponse } from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../db/schema.js";
import { AppError, ServiceUnavailableError } from "../../shared/errors.js";
import { verifyAltchaPayload } from "./altcha.service.js";
import { verifyPassword } from "./password.service.js";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 20 * 60;

type SubUserCredentialRow = {
  id: number;
  name: string;
  password_hash: string;
};

export class InvalidCredentialsError extends AppError {
  constructor() {
    super("INVALID_CREDENTIALS", "用户名或密码错误", 401);
  }
}

export async function loginWithPassword(
  app: FastifyInstance,
  payload: AuthLoginRequest,
): Promise<AuthLoginResponse> {
  const altcha = await verifyAltchaPayload(payload.altcha);

  if (!altcha.verified) {
    throw new InvalidCredentialsError();
  }

  if (!app.db) {
    throw new ServiceUnavailableError("DATABASE_NOT_CONFIGURED", "登录服务暂不可用");
  }

  const subUser = await findActiveSubUserCredential(app.db, payload.account);

  if (!subUser) {
    throw new InvalidCredentialsError();
  }

  if (!(await verifyPassword(subUser.password_hash, payload.password))) {
    throw new InvalidCredentialsError();
  }

  const subUserId = String(subUser.id);
  const accessToken = app.jwt.sign({
    roles: ["agent"],
    subUserId,
  });

  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    subUser: {
      displayName: subUser.name,
      subUserId,
    },
    tokenType: "Bearer",
  };
}

async function findActiveSubUserCredential(
  db: Kysely<Database>,
  account: string,
): Promise<SubUserCredentialRow | undefined> {
  const normalizedAccount = account.trim();

  if (!normalizedAccount) {
    return undefined;
  }

  return db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["id", "name", "password_hash"])
    .where("account", "=", normalizedAccount)
    .where("status", "=", 1)
    .executeTakeFirst();
}
