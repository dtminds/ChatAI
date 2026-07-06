import type {
  SettingsSubAccount,
  SettingsSubAccountCreateRequest,
  SettingsSubAccountsResponse,
  SettingsSubAccountStatus,
  SettingsSubAccountUpdateRequest,
  SettingsWeComSeat,
} from "@chatai/contracts";
import {
  isValidSettingsSubAccountPassword,
  settingsSubAccountPasswordMessage,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { CachePort } from "../../cache/cache-port.js";
import {
  invalidateSeatAccess,
  invalidateSubUserSessions,
} from "../../cache/invalidation.js";
import { buildCacheKeys } from "../../cache/keys.js";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { uniquePositiveNumbers } from "../../shared/id-utils.js";
import { deriveAccountRole, normalizeAccountRole } from "../auth/permissions.js";
import { hashPassword } from "../auth/password.service.js";
import type { AuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";
import { hydrateRelationRows } from "./relation-hydration.js";

type TenantScope = AuthenticatedWorkbenchScope;

type SubAccountRow = {
  account: string;
  id: number;
  name: string;
  role: string | null;
  status: number;
  type: number;
};

type SeatRow = {
  avatarUrl: string;
  id: number;
  third_user_name: string;
};

type RelationRow = {
  avatarUrl: string | null;
  name: string | null;
  seat_id: number;
  sub_id: number;
};

type RelationLinkRow = {
  seat_id: number;
  sub_id: number;
};

const dbSubAccountStatus = {
  active: 1,
  deleted: 0,
  disabled: 2,
} as const;

const dbSubAccountType = {
  main: 1,
  sub: 0,
} as const;

export class SubAccountSettingsService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly cache?: CachePort,
    private readonly cacheKeys: ReturnType<typeof buildCacheKeys> = buildCacheKeys("chatai:"),
  ) {}

  async list(scope: TenantScope): Promise<SettingsSubAccountsResponse> {
    const [subAccounts, seats, relationLinks] = await Promise.all([
      this.listSubAccountRows(scope),
      this.listSeatRows(scope),
      this.listRelationLinkRows(scope),
    ]);
    const seatsById = new Map(seats.map((seat) => [seat.id, seat] as const));
    const relationsBySubAccountId = groupRelationsBySubAccountId(
      hydrateSubAccountRelationRows(relationLinks, seatsById),
    );

    return {
      seats: seats.map(mapSeat),
      subAccounts: subAccounts.map((subAccount) =>
        mapSubAccount(
          subAccount,
          relationsBySubAccountId.get(subAccount.id) ?? [],
        ),
      ),
    };
  }

  async create(
    scope: TenantScope,
    payload: SettingsSubAccountCreateRequest,
  ): Promise<SettingsSubAccount> {
    const normalizedAccount = payload.account.trim();
    const normalizedName = payload.name.trim();

    const normalizedPassword = payload.password.trim();

    if (!normalizedAccount || !normalizedName || !normalizedPassword) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "请完整填写子账号信息");
    }

    if (!isValidSettingsSubAccountPassword(normalizedPassword)) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT_PASSWORD", settingsSubAccountPasswordMessage);
    }

    await this.assertAccountAvailable(normalizedAccount);
    const seatIds = await this.normalizeSeatIds(scope, payload.seatIds);
    const inserted = await this.db
      .insertInto("xy_wap_embed_sub_user")
      .values({
        account: normalizedAccount,
        name: normalizedName,
        password_hash: await hashPassword(normalizedPassword),
        platform: scope.platform,
        role: payload.role,
        status: dbSubAccountStatus.active,
        type: dbSubAccountType.sub,
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow();
    const subAccountId = Number(
      "insertId" in inserted ? inserted.insertId : (inserted as { id?: number }).id,
    );

    await this.replaceSeatRelations(scope, subAccountId, seatIds);
    await this.invalidateSeatAccess(subAccountId);

    return this.getSubAccountOrThrow(scope, subAccountId);
  }

  async update(
    scope: TenantScope,
    subAccountId: string,
    payload: SettingsSubAccountUpdateRequest,
  ): Promise<SettingsSubAccount> {
    const numericSubAccountId = parseMySqlId(subAccountId);
    const normalizedName = payload.name.trim();

    if (numericSubAccountId == null || !normalizedName) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "请完整填写子账号信息");
    }

    await this.assertSubAccountInScope(scope, numericSubAccountId);
    const currentSubAccount = await this.getSubAccountRow(scope, numericSubAccountId);

    if (currentSubAccount?.type === dbSubAccountType.main && payload.role) {
      throw new BadRequestError("OWNER_ROLE_IMMUTABLE", "主账号角色不允许修改");
    }

    const updateValues: {
      name: string;
      password_hash?: string;
      role?: string;
      update_time: Date;
    } = {
      name: normalizedName,
      update_time: new Date(),
    };

    const normalizedPassword = payload.password?.trim() ?? "";
    let shouldRevokeSessions = false;
    let shouldExpireAccessTokens = false;

    if (normalizedPassword) {
      if (!isValidSettingsSubAccountPassword(normalizedPassword)) {
        throw new BadRequestError("INVALID_SUB_ACCOUNT_PASSWORD", settingsSubAccountPasswordMessage);
      }

      updateValues.password_hash = await hashPassword(normalizedPassword);
      shouldRevokeSessions = true;
    }

    if (payload.role) {
      const nextRole = normalizeAccountRole(payload.role);

      if (!nextRole || nextRole === "owner") {
        throw new BadRequestError("ROLE_NOT_ALLOWED", "角色不合法");
      }

      updateValues.role = nextRole;
      shouldExpireAccessTokens ||=
        nextRole !== deriveAccountRole({
          role: currentSubAccount?.role,
          type: currentSubAccount?.type,
        });
    }

    await this.db
      .updateTable("xy_wap_embed_sub_user")
      .set(updateValues)
      .where("id", "=", numericSubAccountId)
      .where("uid", "=", scope.uid)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .execute();

    if (shouldRevokeSessions) {
      await this.revokeActiveSessions(numericSubAccountId);
    } else if (shouldExpireAccessTokens) {
      await this.expireAccessTokens(numericSubAccountId);
    }

    const seatIds = await this.normalizeSeatIds(scope, payload.seatIds);
    await this.replaceSeatRelations(scope, numericSubAccountId, seatIds);
    await this.invalidateSeatAccess(numericSubAccountId);

    return this.getSubAccountOrThrow(scope, numericSubAccountId);
  }

  async updateStatus(
    scope: TenantScope,
    subAccountId: string,
    status: SettingsSubAccountStatus,
  ): Promise<SettingsSubAccount> {
    const numericSubAccountId = parseMySqlId(subAccountId);

    if (numericSubAccountId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "子账号不存在");
    }

    await this.assertSubAccountCanBeManaged(scope, numericSubAccountId);
    await this.db
      .updateTable("xy_wap_embed_sub_user")
      .set({
        status: status === "active" ? dbSubAccountStatus.active : dbSubAccountStatus.disabled,
        update_time: new Date(),
      })
      .where("id", "=", numericSubAccountId)
      .where("uid", "=", scope.uid)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .execute();

    if (status === "disabled") {
      await this.revokeActiveSessions(numericSubAccountId);
    }
    await this.invalidateSeatAccess(numericSubAccountId);

    return this.getSubAccountOrThrow(scope, numericSubAccountId);
  }

  async remove(scope: TenantScope, subAccountId: string) {
    const numericSubAccountId = parseMySqlId(subAccountId);

    if (numericSubAccountId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "子账号不存在");
    }

    await this.assertSubAccountCanBeManaged(scope, numericSubAccountId);
    await this.db
      .updateTable("xy_wap_embed_sub_user")
      .set({
        status: dbSubAccountStatus.deleted,
        update_time: new Date(),
      })
      .where("id", "=", numericSubAccountId)
      .where("uid", "=", scope.uid)
      .where("type", "=", dbSubAccountType.sub)
      .execute();

    await this.db
      .deleteFrom("xy_wap_embed_user_seat_sub_relation")
      .where("sub_id", "=", numericSubAccountId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .execute();

    await this.db
      .updateTable("xy_wap_embed_user_seat")
      .set({ host_sub_id: 0 })
      .where("host_sub_id", "=", numericSubAccountId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .execute();

    await this.revokeActiveSessions(numericSubAccountId);
    await this.invalidateSeatAccess(numericSubAccountId);

    return { deleted: true };
  }

  private listSubAccountRows(scope: TenantScope) {
    return this.db
      .selectFrom("xy_wap_embed_sub_user as sub_user")
      .select([
        "sub_user.account",
        "sub_user.id",
        "sub_user.name",
        "sub_user.role",
        "sub_user.status",
        "sub_user.type",
      ])
      .where("sub_user.uid", "=", scope.uid)
      .where("sub_user.status", "!=", dbSubAccountStatus.deleted)
      .orderBy("sub_user.id", "desc")
      .execute() as Promise<SubAccountRow[]>;
  }

  private listSeatRows(scope: TenantScope, seatIds?: number[]) {
    let query = this.db
      .selectFrom("xy_wap_embed_user_seat")
      .select(["third_avatar as avatarUrl", "id", "third_user_name"])
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform);

    if (seatIds !== undefined) {
      query = query.where("id", "in", seatIds);
    }

    return query.orderBy("id", "desc").execute() as Promise<SeatRow[]>;
  }

  private listRelationLinkRows(scope: TenantScope, subAccountId?: number) {
    let query = this.db
      .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
      .select([
        "relation.sub_id as sub_id",
        "relation.user_seat_id as seat_id",
      ])
      .where("relation.uid", "=", scope.uid)
      .where("relation.platform", "=", scope.platform);

    if (subAccountId !== undefined) {
      query = query.where("relation.sub_id", "=", subAccountId);
    }

    return query.execute() as Promise<RelationLinkRow[]>;
  }

  private async assertAccountAvailable(account: string) {
    const existing = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select("id")
      .where("account", "=", account)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .executeTakeFirst();

    if (existing) {
      throw new BadRequestError("SUB_ACCOUNT_EXISTS", "登录用户名已存在");
    }
  }

  private async assertSubAccountInScope(scope: TenantScope, subAccountId: number) {
    const subAccount = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["id", "role", "type"])
      .where("id", "=", subAccountId)
      .where("uid", "=", scope.uid)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .executeTakeFirst();

    if (!subAccount) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "子账号不存在");
    }
  }

  private async assertSubAccountCanBeManaged(scope: TenantScope, subAccountId: number) {
    const subAccount = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["id", "role", "type"])
      .where("id", "=", subAccountId)
      .where("uid", "=", scope.uid)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .executeTakeFirst();

    if (!subAccount) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "子账号不存在");
    }

    if (subAccount.type === dbSubAccountType.main) {
      throw new BadRequestError("MAIN_ACCOUNT_PROTECTED", "主账号不允许禁用或删除");
    }
  }

  private async revokeActiveSessions(subAccountId: number) {
    await this.db
      .updateTable("xy_wap_embed_sub_user_session")
      .set({
        revoked_at: new Date(),
        update_time: new Date(),
      })
      .where("sub_user_id", "=", subAccountId)
      .where("revoked_at", "is", null)
      .execute();
    await this.invalidateSubUserSessions(subAccountId);
  }

  private async expireAccessTokens(subAccountId: number) {
    await this.db
      .updateTable("xy_wap_embed_sub_user_session")
      .set((expressionBuilder) => ({
        session_version: expressionBuilder("session_version", "+", 1),
        update_time: new Date(),
      }))
      .where("sub_user_id", "=", subAccountId)
      .where("revoked_at", "is", null)
      .execute();
    await this.invalidateSubUserSessions(subAccountId);
  }

  private async normalizeSeatIds(scope: TenantScope, rawSeatIds: string[]) {
    const uniqueSeatIds = uniquePositiveNumbers(rawSeatIds.map(parseMySqlId));

    if (uniqueSeatIds.length !== rawSeatIds.length) {
      throw new BadRequestError("INVALID_SEAT", "托管账号不存在");
    }

    if (uniqueSeatIds.length === 0) {
      return [];
    }

    const seats = await this.listSeatRows(scope);
    const validSeatIds = new Set(seats.map((seat) => seat.id));

    if (uniqueSeatIds.some((seatId) => !validSeatIds.has(seatId))) {
      throw new BadRequestError("INVALID_SEAT", "托管账号不存在");
    }

    return uniqueSeatIds;
  }

  private invalidateSubUserSessions(subAccountId: number) {
    return invalidateSubUserSessions(this.cache, this.cacheKeys, subAccountId);
  }

  private invalidateSeatAccess(subAccountId: number) {
    return invalidateSeatAccess(this.cache, this.cacheKeys, subAccountId);
  }

  private async replaceSeatRelations(
    scope: TenantScope,
    subAccountId: number,
    seatIds: number[],
  ) {
    await this.db
      .deleteFrom("xy_wap_embed_user_seat_sub_relation")
      .where("sub_id", "=", subAccountId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .execute();

    if (seatIds.length === 0) {
      return;
    }

    await this.db
      .insertInto("xy_wap_embed_user_seat_sub_relation")
      .values(
        seatIds.map((seatId) => ({
          platform: scope.platform,
          sub_id: subAccountId,
          uid: scope.uid,
          user_seat_id: seatId,
        })),
      )
      .execute();
  }

  private async getSubAccountOrThrow(scope: TenantScope, subAccountId: number) {
    const [subAccount, relationLinks] = await Promise.all([
      this.getSubAccountRow(scope, subAccountId),
      this.listRelationLinkRows(scope, subAccountId),
    ]);

    if (!subAccount) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "子账号不存在");
    }

    const seatIds = uniquePositiveNumbers(relationLinks.map((relation) => relation.seat_id));
    const seats = seatIds.length === 0 ? [] : await this.listSeatRows(scope, seatIds);
    const seatsById = new Map(seats.map((seat) => [seat.id, seat] as const));
    const relations = hydrateSubAccountRelationRows(relationLinks, seatsById);

    return mapSubAccount(
      subAccount,
      relations.map(mapRelationSeat),
    );
  }

  private async getSubAccountRow(scope: TenantScope, subAccountId: number) {
    return this.db
      .selectFrom("xy_wap_embed_sub_user as sub_user")
      .select([
        "sub_user.account",
        "sub_user.id",
        "sub_user.name",
        "sub_user.role",
        "sub_user.status",
        "sub_user.type",
      ])
      .where("sub_user.id", "=", subAccountId)
      .where("sub_user.uid", "=", scope.uid)
      .where("sub_user.status", "!=", dbSubAccountStatus.deleted)
      .executeTakeFirst() as Promise<SubAccountRow | undefined>;
  }
}

export function createSubAccountSettingsService(
  db: Kysely<Database>,
  cache?: CachePort,
  cacheKeys?: ReturnType<typeof buildCacheKeys>,
) {
  return new SubAccountSettingsService(db, cache, cacheKeys);
}

function mapSubAccount(
  row: SubAccountRow,
  seats: SettingsWeComSeat[],
): SettingsSubAccount {
  const role = deriveAccountRole({
    role: normalizeAccountRole(row.role),
    type: row.type,
  });

  return {
    account: row.account,
    id: String(row.id),
    name: row.name,
    role,
    seats,
    status: row.status === dbSubAccountStatus.active ? "active" : "disabled",
    type: row.type === dbSubAccountType.main ? dbSubAccountType.main : dbSubAccountType.sub,
  };
}

function groupRelationsBySubAccountId(relations: RelationRow[]) {
  const relationsBySubAccountId = new Map<number, SettingsWeComSeat[]>();

  for (const relation of relations) {
    const seats = relationsBySubAccountId.get(relation.sub_id) ?? [];

    seats.push(mapRelationSeat(relation));
    relationsBySubAccountId.set(relation.sub_id, seats);
  }

  return relationsBySubAccountId;
}

function hydrateSubAccountRelationRows(
  relations: RelationLinkRow[],
  seatsById: Map<number, SeatRow>,
): RelationRow[] {
  return hydrateRelationRows(
    relations,
    seatsById,
    (relation) => relation.seat_id,
    (relation, seat) => ({
        avatarUrl: seat.avatarUrl,
        name: seat.third_user_name,
        seat_id: relation.seat_id,
        sub_id: relation.sub_id,
    }),
  );
}

function mapSeat(row: SeatRow): SettingsWeComSeat {
  return {
    avatarUrl: row.avatarUrl || "",
    name: row.third_user_name || "未命名托管账号",
    seatId: String(row.id),
  };
}

function mapRelationSeat(row: RelationRow): SettingsWeComSeat {
  return {
    avatarUrl: row.avatarUrl || "",
    name: row.name || "未命名托管账号",
    seatId: String(row.seat_id),
  };
}

function parseMySqlId(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) && String(parsed) === value ? parsed : undefined;
}
