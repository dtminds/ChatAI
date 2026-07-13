import type {
  SettingsGroupChat,
  SettingsGroupChatsQuery,
  SettingsGroupChatsResponse,
} from "@chatai/contracts";
import { type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import type { AuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";

type TenantScope = AuthenticatedWorkbenchScope;

type GroupChatRow = {
  avatar: string | null;
  group_seat_id: number;
  group_name: string | null;
  group_remark: string | null;
  seat_avatar: string | null;
  seat_id: number;
  seat_name: string | null;
  third_group_id: string;
};

type ManagedAccountFilterRow = {
  id: number;
  name: string | null;
};

const dbActiveStatus = 1;
const groupChatListLimit = 500;

export class GroupChatSettingsService {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    scope: TenantScope,
    query: SettingsGroupChatsQuery = {},
  ): Promise<SettingsGroupChatsResponse> {
    const [filterManagedAccounts, receptionManagedAccountsByGroupId, groupChatRows] =
      await Promise.all([
        this.listFilterManagedAccounts(scope),
        this.listReceptionManagedAccountsByGroupId(scope),
        this.listGroupChatRows(scope, query),
      ]);
    const selectableReceptionManagedAccountsByGroupSeatId =
      await this.listSelectableReceptionManagedAccountsByGroupSeatId(scope, groupChatRows);

    return {
      filterManagedAccounts: filterManagedAccounts.map((account) => ({
        id: String(account.id),
        name: account.name || "未命名托管账号",
      })),
      groupChats: groupChatRows.map((row) =>
        mapGroupChat(
          row,
          receptionManagedAccountsByGroupId.get(row.third_group_id) ?? [],
          selectableReceptionManagedAccountsByGroupSeatId.get(row.group_seat_id) ?? [],
        ),
      ),
    };
  }

  private listFilterManagedAccounts(scope: TenantScope) {
    return this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select(["seat.id", "seat.third_user_name as name"])
      .where("seat.uid", "=", scope.uid)
      .where("seat.platform", "=", scope.platform)
      .orderBy("seat.id", "desc")
      .execute() as Promise<ManagedAccountFilterRow[]>;
  }

  private async listReceptionManagedAccountsByGroupId(scope: TenantScope) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_group_seat as reception_group_seat")
      .innerJoin("xy_wap_embed_user_seat as reception_seat", (join) =>
        join
          .onRef("reception_seat.third_userid", "=", "reception_group_seat.third_userid")
          .onRef("reception_seat.uid", "=", "reception_group_seat.uid")
          .onRef("reception_seat.platform", "=", "reception_group_seat.platform"),
      )
      .select([
        "reception_group_seat.third_group_id as third_group_id",
        "reception_seat.id as seat_id",
        "reception_seat.third_avatar as seat_avatar",
        "reception_seat.third_user_name as seat_name",
      ])
      .where("reception_group_seat.uid", "=", scope.uid)
      .where("reception_group_seat.platform", "=", scope.platform)
      .where("reception_group_seat.biz_status", "=", dbActiveStatus)
      .orderBy("reception_seat.id", "desc")
      .execute();

    const accountsByGroupId = new Map<
      string,
      SettingsGroupChat["receptionManagedAccounts"]
    >();
    const seenSeatIdsByGroupId = new Map<string, Set<string>>();

    for (const row of rows) {
      const seatId = String(row.seat_id);
      const seenSeatIds =
        seenSeatIdsByGroupId.get(row.third_group_id) ?? new Set<string>();

      if (seenSeatIds.has(seatId)) {
        continue;
      }

      seenSeatIds.add(seatId);
      seenSeatIdsByGroupId.set(row.third_group_id, seenSeatIds);

      const accounts = accountsByGroupId.get(row.third_group_id) ?? [];
      accounts.push({
        avatarUrl: row.seat_avatar || "",
        id: seatId,
        name: row.seat_name || "未命名托管账号",
      });
      accountsByGroupId.set(row.third_group_id, accounts);
    }

    return accountsByGroupId;
  }

  private async listSelectableReceptionManagedAccountsByGroupSeatId(
    scope: TenantScope,
    groupChatRows: GroupChatRow[],
  ) {
    const groupSeatIds = groupChatRows.map((row) => row.group_seat_id);

    if (groupSeatIds.length === 0) {
      return new Map<number, SettingsGroupChat["selectableReceptionManagedAccounts"]>();
    }

    const openingSeatIdByGroupSeatId = new Map(
      groupChatRows.map((row) => [row.group_seat_id, row.seat_id] as const),
    );
    const rows = await this.db
      .selectFrom("xy_wap_embed_group_member as member")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "member.third_userid")
          .onRef("seat.uid", "=", "member.uid")
          .onRef("seat.platform", "=", "member.platform"),
      )
      .select([
        "member.group_seat_id as group_seat_id",
        "seat.id as seat_id",
        "seat.third_avatar as seat_avatar",
        "seat.third_user_name as seat_name",
      ])
      .where("member.uid", "=", scope.uid)
      .where("member.platform", "=", scope.platform)
      .where("member.biz_status", "=", dbActiveStatus)
      .where("seat.biz_status", "=", dbActiveStatus)
      .where("member.group_seat_id", "in", groupSeatIds)
      .orderBy("seat.id", "desc")
      .execute();

    const accountsByGroupSeatId = new Map<
      number,
      SettingsGroupChat["selectableReceptionManagedAccounts"]
    >();
    const seenSeatIdsByGroupSeatId = new Map<number, Set<string>>();

    for (const row of rows) {
      const openingSeatId = openingSeatIdByGroupSeatId.get(row.group_seat_id);

      if (openingSeatId == null || row.seat_id === openingSeatId) {
        continue;
      }

      const seatId = String(row.seat_id);
      const seenSeatIds =
        seenSeatIdsByGroupSeatId.get(row.group_seat_id) ?? new Set<string>();

      if (seenSeatIds.has(seatId)) {
        continue;
      }

      seenSeatIds.add(seatId);
      seenSeatIdsByGroupSeatId.set(row.group_seat_id, seenSeatIds);

      const accounts = accountsByGroupSeatId.get(row.group_seat_id) ?? [];
      accounts.push({
        avatarUrl: row.seat_avatar || "",
        id: seatId,
        name: row.seat_name || "未命名托管账号",
      });
      accountsByGroupSeatId.set(row.group_seat_id, accounts);
    }

    return accountsByGroupSeatId;
  }

  private listGroupChatRows(scope: TenantScope, query: SettingsGroupChatsQuery) {
    let groupQuery = this.db
      .selectFrom("xy_wap_embed_group_seat as group_seat")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "group_seat.third_userid")
          .onRef("seat.uid", "=", "group_seat.uid")
          .onRef("seat.platform", "=", "group_seat.platform"),
      )
      .select([
        "group_seat.avatar as avatar",
        "group_seat.id as group_seat_id",
        "group_seat.name as group_name",
        "group_seat.remark as group_remark",
        "group_seat.third_group_id as third_group_id",
        "seat.id as seat_id",
        "seat.third_avatar as seat_avatar",
        "seat.third_user_name as seat_name",
      ])
      .where("group_seat.uid", "=", scope.uid)
      .where("group_seat.platform", "=", scope.platform)
      .where("group_seat.biz_status", "=", dbActiveStatus)
      .orderBy("group_seat.id", "desc")
      .limit(groupChatListLimit);

    const managedAccountId = parseMySqlId(query.managedAccountId);

    if (managedAccountId != null) {
      groupQuery = groupQuery.where("seat.id", "=", managedAccountId);
    }

    const keyword = query.keyword?.trim();

    if (keyword) {
      const pattern = `%${escapeLikeKeyword(keyword)}%`;

      groupQuery = groupQuery.where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("group_seat.name", "like", pattern),
          expressionBuilder("group_seat.remark", "like", pattern),
          expressionBuilder("group_seat.third_group_id", "like", pattern),
        ]),
      );
    }

    return groupQuery.execute() as Promise<GroupChatRow[]>;
  }
}

export function createGroupChatSettingsService(db: Kysely<Database>) {
  return new GroupChatSettingsService(db);
}

function mapGroupChat(
  row: GroupChatRow,
  receptionManagedAccounts: SettingsGroupChat["receptionManagedAccounts"],
  selectableReceptionManagedAccounts: SettingsGroupChat["selectableReceptionManagedAccounts"],
): SettingsGroupChat {
  return {
    avatarUrl: row.avatar || "",
    id: String(row.group_seat_id),
    name: firstNonEmptyString(row.group_remark, row.group_name) ?? "未知群聊",
    openingManagedAccount: {
      avatarUrl: row.seat_avatar || "",
      id: String(row.seat_id),
      name: row.seat_name || "未命名托管账号",
    },
    receptionManagedAccounts,
    receptionSeatCount: receptionManagedAccounts.length,
    selectableReceptionManagedAccounts,
    thirdGroupId: row.third_group_id,
  };
}

function firstNonEmptyString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function escapeLikeKeyword(keyword: string) {
  return keyword.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseMySqlId(value: string | number | null | undefined) {
  if (value == null || value === "") {
    return undefined;
  }

  const numericValue = typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return numericValue;
}
