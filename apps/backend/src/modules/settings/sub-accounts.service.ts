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
import type { Database } from "../../db/schema.js";
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import { hashPassword } from "../auth/password.service.js";

type TenantScope = {
  platform: number;
  uid: number;
};

type SubAccountRow = {
  account: string;
  id: number;
  name: string;
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
  constructor(private readonly db: Kysely<Database>) {}

  async list(currentSubUserId: string): Promise<SettingsSubAccountsResponse> {
    const scope = await this.getTenantScope(currentSubUserId);
    const [subAccounts, seats, relations] = await Promise.all([
      this.listSubAccountRows(scope),
      this.listSeatRows(scope),
      this.listRelationRows(scope),
    ]);
    const relationsBySubAccountId = groupRelationsBySubAccountId(relations);

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
    currentSubUserId: string,
    payload: SettingsSubAccountCreateRequest,
  ): Promise<SettingsSubAccount> {
    const scope = await this.getTenantScope(currentSubUserId);
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
        status: dbSubAccountStatus.active,
        type: dbSubAccountType.sub,
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow();
    const subAccountId = Number(
      "insertId" in inserted ? inserted.insertId : (inserted as { id?: number }).id,
    );

    await this.replaceSeatRelations(scope, subAccountId, seatIds);

    return this.getSubAccountOrThrow(scope, subAccountId);
  }

  async update(
    currentSubUserId: string,
    subAccountId: string,
    payload: SettingsSubAccountUpdateRequest,
  ): Promise<SettingsSubAccount> {
    const scope = await this.getTenantScope(currentSubUserId);
    const numericSubAccountId = parseMySqlId(subAccountId);
    const normalizedName = payload.name.trim();

    if (numericSubAccountId == null || !normalizedName) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "请完整填写子账号信息");
    }

    await this.assertSubAccountInScope(scope, numericSubAccountId);
    const updateValues: {
      name: string;
      password_hash?: string;
      update_time: Date;
    } = {
      name: normalizedName,
      update_time: new Date(),
    };

    const normalizedPassword = payload.password?.trim() ?? "";

    if (normalizedPassword) {
      if (!isValidSettingsSubAccountPassword(normalizedPassword)) {
        throw new BadRequestError("INVALID_SUB_ACCOUNT_PASSWORD", settingsSubAccountPasswordMessage);
      }

      updateValues.password_hash = await hashPassword(normalizedPassword);
    }

    await this.db
      .updateTable("xy_wap_embed_sub_user")
      .set(updateValues)
      .where("id", "=", numericSubAccountId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .execute();

    const seatIds = await this.normalizeSeatIds(scope, payload.seatIds);
    await this.replaceSeatRelations(scope, numericSubAccountId, seatIds);

    return this.getSubAccountOrThrow(scope, numericSubAccountId);
  }

  async updateStatus(
    currentSubUserId: string,
    subAccountId: string,
    status: SettingsSubAccountStatus,
  ): Promise<SettingsSubAccount> {
    const scope = await this.getTenantScope(currentSubUserId);
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
      .where("platform", "=", scope.platform)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .execute();

    return this.getSubAccountOrThrow(scope, numericSubAccountId);
  }

  async remove(currentSubUserId: string, subAccountId: string) {
    const scope = await this.getTenantScope(currentSubUserId);
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
      .where("platform", "=", scope.platform)
      .where("type", "=", dbSubAccountType.sub)
      .execute();

    return { deleted: true };
  }

  private async getTenantScope(currentSubUserId: string): Promise<TenantScope> {
    const numericSubUserId = parseMySqlId(currentSubUserId);

    if (numericSubUserId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    const currentSubUser = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["platform", "uid"])
      .where("id", "=", numericSubUserId)
      .where("status", "=", dbSubAccountStatus.active)
      .executeTakeFirst();

    if (!currentSubUser) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "当前账号不存在");
    }

    return {
      platform: currentSubUser.platform,
      uid: currentSubUser.uid,
    };
  }

  private listSubAccountRows(scope: TenantScope) {
    return this.db
      .selectFrom("xy_wap_embed_sub_user as sub_user")
      .select([
        "sub_user.account",
        "sub_user.id",
        "sub_user.name",
        "sub_user.status",
        "sub_user.type",
      ])
      .where("sub_user.uid", "=", scope.uid)
      .where("sub_user.platform", "=", scope.platform)
      .where("sub_user.status", "!=", dbSubAccountStatus.deleted)
      .orderBy("sub_user.id", "desc")
      .execute() as Promise<SubAccountRow[]>;
  }

  private listSeatRows(scope: TenantScope) {
    return this.db
      .selectFrom("xy_wap_embed_user_seat")
      .select(["third_avatar as avatarUrl", "id", "third_user_name"])
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", 1)
      .orderBy("id", "desc")
      .execute() as Promise<SeatRow[]>;
  }

  private listRelationRows(scope: TenantScope, subAccountId?: number) {
    let query = this.db
      .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.id", "=", "relation.user_seat_id")
          .onRef("seat.uid", "=", "relation.uid")
          .onRef("seat.platform", "=", "relation.platform"),
      )
      .select([
        "relation.sub_id as sub_id",
        "seat.third_avatar as avatarUrl",
        "seat.id as seat_id",
        "seat.third_user_name as name",
      ])
      .where("relation.uid", "=", scope.uid)
      .where("relation.platform", "=", scope.platform)
      .where("seat.biz_status", "=", 1);

    if (subAccountId !== undefined) {
      query = query.where("relation.sub_id", "=", subAccountId);
    }

    return query.execute() as Promise<RelationRow[]>;
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
      .select(["id", "type"])
      .where("id", "=", subAccountId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .executeTakeFirst();

    if (!subAccount) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "子账号不存在");
    }
  }

  private async assertSubAccountCanBeManaged(scope: TenantScope, subAccountId: number) {
    const subAccount = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["id", "type"])
      .where("id", "=", subAccountId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("status", "!=", dbSubAccountStatus.deleted)
      .executeTakeFirst();

    if (!subAccount) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "子账号不存在");
    }

    if (subAccount.type === dbSubAccountType.main) {
      throw new BadRequestError("MAIN_ACCOUNT_PROTECTED", "主账号不允许禁用或删除");
    }
  }

  private async normalizeSeatIds(scope: TenantScope, rawSeatIds: string[]) {
    const uniqueSeatIds = Array.from(new Set(rawSeatIds.map(parseMySqlId))).filter(
      (seatId): seatId is number => seatId != null,
    );

    if (uniqueSeatIds.length !== rawSeatIds.length) {
      throw new BadRequestError("INVALID_SEAT", "企微账号不存在");
    }

    if (uniqueSeatIds.length === 0) {
      return [];
    }

    const seats = await this.listSeatRows(scope);
    const validSeatIds = new Set(seats.map((seat) => seat.id));

    if (uniqueSeatIds.some((seatId) => !validSeatIds.has(seatId))) {
      throw new BadRequestError("INVALID_SEAT", "企微账号不存在");
    }

    return uniqueSeatIds;
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
    const [subAccount, relations] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_sub_user as sub_user")
        .select([
          "sub_user.account",
          "sub_user.id",
          "sub_user.name",
          "sub_user.status",
          "sub_user.type",
        ])
        .where("sub_user.id", "=", subAccountId)
        .where("sub_user.uid", "=", scope.uid)
        .where("sub_user.platform", "=", scope.platform)
        .where("sub_user.status", "!=", dbSubAccountStatus.deleted)
        .executeTakeFirst() as Promise<SubAccountRow | undefined>,
      this.listRelationRows(scope, subAccountId),
    ]);

    if (!subAccount) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "子账号不存在");
    }

    return mapSubAccount(
      subAccount,
      relations.map(mapRelationSeat),
    );
  }
}

export function createSubAccountSettingsService(db: Kysely<Database> | undefined) {
  if (!db) {
    throw new ServiceUnavailableError("DATABASE_NOT_CONFIGURED", "设置服务暂不可用");
  }

  return new SubAccountSettingsService(db);
}

function mapSubAccount(
  row: SubAccountRow,
  seats: SettingsWeComSeat[],
): SettingsSubAccount {
  return {
    account: row.account,
    id: String(row.id),
    name: row.name,
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

function mapSeat(row: SeatRow): SettingsWeComSeat {
  return {
    avatarUrl: row.avatarUrl || "",
    name: row.third_user_name || "未命名企微账号",
    seatId: String(row.id),
  };
}

function mapRelationSeat(row: RelationRow): SettingsWeComSeat {
  return {
    avatarUrl: row.avatarUrl || "",
    name: row.name || "未命名企微账号",
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
