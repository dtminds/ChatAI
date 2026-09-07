import {
  type AuthSubUser,
  type JwtUser,
  type SupportInvestigationStartRequest,
  type SupportInvestigationTargetAccount,
} from "@chatai/contracts";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { ForbiddenError, NotFoundError } from "../../shared/errors.js";
import {
  chatAiSubAccountTypes,
  deriveAccountRole,
  deriveAccountType,
  getRolePermissions,
} from "./permissions.js";
import { canStartSupportInvestigation } from "./support-investigation-access.js";

export const SUPPORT_INVESTIGATION_EXPIRES_IN_SECONDS = 30 * 60;

type SupportTargetRow = {
  account: string;
  id: number;
  name: string;
  role: string;
  type: number;
  uid: number;
};

export async function listSupportInvestigationAccounts(
  app: FastifyInstance,
  actor: JwtUser,
  uid: number,
): Promise<SupportInvestigationTargetAccount[]> {
  assertCanStart(actor);

  const rows = await app.db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["account", "id", "name", "role", "type", "uid"])
    .where("uid", "=", uid)
    .where("status", "=", 1)
    .where("type", "in", chatAiSubAccountTypes)
    .orderBy("type", "desc")
    .orderBy("id", "asc")
    .execute();

  return rows.map(mapTargetAccount);
}

export async function startSupportInvestigation(
  app: FastifyInstance,
  actor: JwtUser,
  input: SupportInvestigationStartRequest,
) {
  assertCanStart(actor);

  const subUserId = parseSubUserId(input.subUserId);
  const target = await app.db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["account", "id", "name", "role", "type", "uid"])
    .where("id", "=", subUserId)
    .where("uid", "=", input.uid)
    .where("status", "=", 1)
    .where("type", "in", chatAiSubAccountTypes)
    .executeTakeFirst();

  if (!target) {
    throw new NotFoundError("SUPPORT_TARGET_NOT_FOUND", "目标账号不存在或不可用");
  }

  await app.db
    .insertInto("xy_wap_embed_support_investigation_log")
    .values({
      actor_sub_user_id: Number(actor.subUserId),
      actor_uid: actor.uid,
      investigation_reason: input.reason,
      target_sub_user_id: target.id,
      target_uid: target.uid,
    })
    .execute();

  const role = deriveAccountRole(target);
  const accessToken = app.jwt.sign(
    {
      accessMode: "support_readonly",
      actorSubUserId: actor.subUserId,
      actorUid: actor.uid,
      investigationReason: input.reason,
      roles: [role],
      sessionId: `support:${randomUUID()}`,
      sessionVersion: 0,
      subUserId: String(target.id),
      uid: target.uid,
    },
    { expiresIn: SUPPORT_INVESTIGATION_EXPIRES_IN_SECONDS },
  );

  return {
    accessToken,
    expiresIn: SUPPORT_INVESTIGATION_EXPIRES_IN_SECONDS,
    subUser: mapSupportSubUser(target),
  };
}

function assertCanStart(actor: JwtUser) {
  if (
    actor.accessMode === "support_readonly"
    || !canStartSupportInvestigation(actor)
  ) {
    throw new ForbiddenError("FORBIDDEN", "无权限使用问题排查");
  }
}

function parseSubUserId(value: string) {
  const subUserId = Number(value);

  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(subUserId)) {
    throw new NotFoundError("SUPPORT_TARGET_NOT_FOUND", "目标账号不存在或不可用");
  }

  return subUserId;
}

function mapTargetAccount(row: SupportTargetRow): SupportInvestigationTargetAccount {
  return {
    accountType: deriveAccountType(row.type),
    displayName: row.name,
    maskedAccount: maskLoginAccount(row.account),
    role: deriveAccountRole(row),
    subUserId: String(row.id),
    uid: row.uid,
  };
}

function maskLoginAccount(account: string) {
  const normalizedAccount = account.trim();
  const characters = Array.from(normalizedAccount);

  if (/^\d{11}$/.test(normalizedAccount)) {
    return `${normalizedAccount.slice(0, 3)}****${normalizedAccount.slice(-4)}`;
  }

  if (characters.length <= 1) {
    return "****";
  }

  if (characters.length === 2) {
    return `${characters[0]}****`;
  }

  if (characters.length <= 4) {
    return `${characters[0]}****${characters.at(-1)}`;
  }

  return `${characters.slice(0, 2).join("")}****${characters.slice(-2).join("")}`;
}

function mapSupportSubUser(row: SupportTargetRow): AuthSubUser {
  const role = deriveAccountRole(row);

  return {
    accessMode: "support_readonly",
    accountType: deriveAccountType(row.type),
    displayName: row.name,
    permissions: getRolePermissions(role),
    role,
    subUserId: String(row.id),
    uid: row.uid,
  };
}
