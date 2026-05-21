import type {
  SettingsManagedAccount,
  SettingsManagedAccountSubAccount,
  SettingsManagedAccountsResponse,
  SettingsManagedAccountSubAccountsUpdateRequest,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

type TenantScope = {
  platform: number;
  uid: number;
};

type ManagedAccountRow = {
  avatarUrl: string | null;
  host_sub_id: number | null;
  id: number;
  is_online: number | null;
  third_user_name: string | null;
};

type SubAccountRow = {
  account: string;
  id: number;
  name: string;
  status: number;
  type: number;
};

type RelationRow = {
  account: string | null;
  name: string | null;
  seat_id: number;
  status: number | null;
  sub_id: number;
  type: number | null;
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

export class ManagedAccountSettingsService {
  constructor(private readonly db: Kysely<Database>) {}

  async list(currentSubUserId: string): Promise<SettingsManagedAccountsResponse> {
    const scope = await this.getTenantScope(currentSubUserId);
    const [managedAccounts, subAccounts, relationLinks] = await Promise.all([
      this.listManagedAccountRows(scope),
      this.listAssignableSubAccountRows(scope),
      this.listRelationLinkRows(scope),
    ]);
    const subAccountsById = new Map(
      subAccounts.map((subAccount) => [subAccount.id, subAccount] as const),
    );
    const relationsBySeatId = groupRelationsBySeatId(
      hydrateRelationRows(relationLinks, subAccountsById),
    );

    return {
      managedAccounts: managedAccounts.map((account) =>
        mapManagedAccount(account, relationsBySeatId.get(account.id) ?? []),
      ),
      subAccounts: subAccounts.map((subAccount) =>
        mapSubAccount(subAccount, false),
      ),
    };
  }

  async updateSubAccounts(
    currentSubUserId: string,
    managedAccountId: string,
    payload: SettingsManagedAccountSubAccountsUpdateRequest,
  ): Promise<SettingsManagedAccount> {
    const scope = await this.getTenantScope(currentSubUserId);
    const numericManagedAccountId = parseMySqlId(managedAccountId);

    if (numericManagedAccountId == null) {
      throw new BadRequestError("INVALID_MANAGED_ACCOUNT", "托管账号不存在");
    }

    await this.assertManagedAccountInScope(scope, numericManagedAccountId);
    const subAccountIds = await this.normalizeSubAccountIds(scope, payload.subAccountIds);
    await this.replaceSubAccountRelations(scope, numericManagedAccountId, subAccountIds);

    return this.getManagedAccountOrThrow(scope, numericManagedAccountId);
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

  private listManagedAccountRows(scope: TenantScope) {
    return this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select([
        "seat.third_avatar as avatarUrl",
        "seat.host_sub_id",
        "seat.id",
        "seat.is_online",
        "seat.third_user_name",
      ])
      .where("seat.uid", "=", scope.uid)
      .where("seat.platform", "=", scope.platform)
      .where("seat.biz_status", "=", 1)
      .orderBy("seat.id", "desc")
      .execute() as Promise<ManagedAccountRow[]>;
  }

  private listAssignableSubAccountRows(scope: TenantScope, subAccountIds?: number[]) {
    let query = this.db
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
      .where("sub_user.status", "!=", dbSubAccountStatus.deleted);

    if (subAccountIds !== undefined) {
      query = query.where("sub_user.id", "in", subAccountIds);
    }

    return query
      .orderBy("sub_user.id", "desc")
      .execute() as Promise<SubAccountRow[]>;
  }

  private listRelationLinkRows(scope: TenantScope, managedAccountId?: number) {
    let query = this.db
      .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
      .select([
        "relation.user_seat_id as seat_id",
        "relation.sub_id as sub_id",
      ])
      .where("relation.uid", "=", scope.uid)
      .where("relation.platform", "=", scope.platform);

    if (managedAccountId !== undefined) {
      query = query.where("relation.user_seat_id", "=", managedAccountId);
    }

    return query.execute() as Promise<RelationLinkRow[]>;
  }

  private async assertManagedAccountInScope(scope: TenantScope, managedAccountId: number) {
    const managedAccount = await this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select("seat.id")
      .where("seat.id", "=", managedAccountId)
      .where("seat.uid", "=", scope.uid)
      .where("seat.platform", "=", scope.platform)
      .where("seat.biz_status", "=", 1)
      .executeTakeFirst();

    if (!managedAccount) {
      throw new NotFoundError("MANAGED_ACCOUNT_NOT_FOUND", "托管账号不存在");
    }
  }

  private async normalizeSubAccountIds(scope: TenantScope, rawSubAccountIds: string[]) {
    const uniqueSubAccountIds = Array.from(new Set(rawSubAccountIds.map(parseMySqlId))).filter(
      (subAccountId): subAccountId is number => subAccountId != null,
    );

    if (uniqueSubAccountIds.length !== rawSubAccountIds.length) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "子账号不存在");
    }

    if (uniqueSubAccountIds.length === 0) {
      return [];
    }

    const subAccounts = await this.listAssignableSubAccountRows(scope, uniqueSubAccountIds);
    const validSubAccountIds = new Set(subAccounts.map((subAccount) => subAccount.id));

    if (uniqueSubAccountIds.some((subAccountId) => !validSubAccountIds.has(subAccountId))) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "子账号不存在");
    }

    return uniqueSubAccountIds;
  }

  private async replaceSubAccountRelations(
    scope: TenantScope,
    managedAccountId: number,
    subAccountIds: number[],
  ) {
    await this.db
      .deleteFrom("xy_wap_embed_user_seat_sub_relation")
      .where("user_seat_id", "=", managedAccountId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .execute();

    if (subAccountIds.length === 0) {
      return;
    }

    await this.db
      .insertInto("xy_wap_embed_user_seat_sub_relation")
      .values(
        subAccountIds.map((subAccountId) => ({
          platform: scope.platform,
          sub_id: subAccountId,
          uid: scope.uid,
          user_seat_id: managedAccountId,
        })),
      )
      .execute();
  }

  private async getManagedAccountOrThrow(scope: TenantScope, managedAccountId: number) {
    const [managedAccount, relationLinks] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_user_seat as seat")
        .select([
          "seat.third_avatar as avatarUrl",
          "seat.host_sub_id",
          "seat.id",
          "seat.is_online",
          "seat.third_user_name",
        ])
        .where("seat.id", "=", managedAccountId)
        .where("seat.uid", "=", scope.uid)
        .where("seat.platform", "=", scope.platform)
        .where("seat.biz_status", "=", 1)
        .executeTakeFirst() as Promise<ManagedAccountRow | undefined>,
      this.listRelationLinkRows(scope, managedAccountId),
    ]);

    if (!managedAccount) {
      throw new NotFoundError("MANAGED_ACCOUNT_NOT_FOUND", "托管账号不存在");
    }

    const subAccountIds = uniquePositiveNumbers(relationLinks.map((relation) => relation.sub_id));
    const subAccountsById = new Map(
      (
        subAccountIds.length
          ? await this.listAssignableSubAccountRows(scope, subAccountIds)
          : []
      ).map((subAccount) => [subAccount.id, subAccount] as const),
    );

    return mapManagedAccount(
      managedAccount,
      hydrateRelationRows(relationLinks, subAccountsById),
    );
  }
}

export function createManagedAccountSettingsService(db: Kysely<Database>) {
  return new ManagedAccountSettingsService(db);
}

function groupRelationsBySeatId(relations: RelationRow[]) {
  const relationsBySeatId = new Map<number, RelationRow[]>();

  for (const relation of relations) {
    const currentRelations = relationsBySeatId.get(relation.seat_id) ?? [];

    currentRelations.push(relation);
    relationsBySeatId.set(relation.seat_id, currentRelations);
  }

  return relationsBySeatId;
}

function hydrateRelationRows(
  relations: RelationLinkRow[],
  subAccountsById: Map<number, SubAccountRow>,
): RelationRow[] {
  return relations
    .map((relation): RelationRow | undefined => {
      const subAccount = subAccountsById.get(relation.sub_id);

      if (!subAccount) {
        return undefined;
      }

      return {
        account: subAccount.account,
        name: subAccount.name,
        seat_id: relation.seat_id,
        status: subAccount.status,
        sub_id: relation.sub_id,
        type: subAccount.type,
      };
    })
    .filter((relation): relation is RelationRow => relation !== undefined);
}

function uniquePositiveNumbers(values: Array<number | undefined>) {
  return Array.from(
    new Set(
      values.filter((value): value is number =>
        typeof value === "number" && Number.isSafeInteger(value) && value > 0,
      ),
    ),
  );
}

function mapManagedAccount(
  row: ManagedAccountRow,
  relations: RelationRow[],
): SettingsManagedAccount {
  return {
    avatarUrl: row.avatarUrl || "",
    id: String(row.id),
    name: row.third_user_name || "未命名托管账号",
    onlineStatus: row.is_online === 1 ? "online" : "offline",
    subAccounts: relations.map((relation) =>
      mapRelationSubAccount(relation, relation.sub_id === row.host_sub_id),
    ),
  };
}

function mapSubAccount(
  row: SubAccountRow,
  isTakingOver: boolean,
): SettingsManagedAccountSubAccount {
  return {
    account: row.account,
    id: String(row.id),
    isTakingOver,
    name: row.name,
    status: row.status === dbSubAccountStatus.active ? "active" : "disabled",
    type: row.type === dbSubAccountType.main ? dbSubAccountType.main : dbSubAccountType.sub,
  };
}

function mapRelationSubAccount(
  row: RelationRow,
  isTakingOver: boolean,
): SettingsManagedAccountSubAccount {
  return {
    account: row.account || "",
    id: String(row.sub_id),
    isTakingOver,
    name: row.name || "未命名子账号",
    status: row.status === dbSubAccountStatus.active ? "active" : "disabled",
    type: row.type === dbSubAccountType.main ? dbSubAccountType.main : dbSubAccountType.sub,
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
