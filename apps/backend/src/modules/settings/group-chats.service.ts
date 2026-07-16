import type {
  SettingsGroupChat,
  SettingsGroupChatReceptionManagedAccount,
  SettingsGroupChatReceptionOptionsRequest,
  SettingsGroupChatReceptionOptionsResponse,
  SettingsGroupChatReceptionUpdateRequest,
  SettingsGroupChatReceptionUpdateResponse,
  SettingsGroupChatsQuery,
  SettingsGroupChatsResponse,
} from "@chatai/contracts";
import { type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError } from "../../shared/errors.js";
import type { AuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";
import type { WorkbenchJavaClient } from "../chat/workbench-java-client.js";

type TenantScope = AuthenticatedWorkbenchScope;

type GroupChatRow = {
  avatar: string | null;
  group_seat_id: number;
  group_name: string | null;
  group_remark: string | null;
  host_user_seat_ids: string | null;
  seat_avatar: string | null;
  seat_id: number;
  seat_name: string | null;
  third_group_id: string;
};

type ManagedAccountFilterRow = {
  id: number;
  name: string | null;
};

type SeatIdentityRow = {
  id: number;
  third_avatar: string | null;
  third_user_name: string | null;
};

const dbActiveStatus = 1;
const defaultGroupChatPage = 1;
const defaultGroupChatPageSize = 10;
const maxGroupChatPageSize = 50;
const maxReceptionManagedAccountsPerGroup = 5;

export class GroupChatSettingsService {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    scope: TenantScope,
    query: SettingsGroupChatsQuery = {},
  ): Promise<SettingsGroupChatsResponse> {
    const requestedPage = normalizePositiveInteger(query.page, defaultGroupChatPage);
    const pageSize = Math.min(
      normalizePositiveInteger(query.pageSize, defaultGroupChatPageSize),
      maxGroupChatPageSize,
    );
    const [filterManagedAccounts, total] = await Promise.all([
      this.listFilterManagedAccounts(scope),
      this.countGroupChatRows(scope, query),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const groupChatRows = await this.listGroupChatRows(scope, query, page, pageSize);
    const receptionManagedAccountsByGroupSeatId =
      await this.listReceptionManagedAccountsByGroupSeatId(scope, groupChatRows);

    return {
      filterManagedAccounts: filterManagedAccounts.map((account) => ({
        id: String(account.id),
        name: account.name || "未命名托管账号",
      })),
      groupChats: groupChatRows.map((row) =>
        mapGroupChat(
          row,
          receptionManagedAccountsByGroupSeatId.get(row.group_seat_id) ?? [],
        ),
      ),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async listReceptionOptions(
    scope: TenantScope,
    payload: SettingsGroupChatReceptionOptionsRequest,
  ): Promise<SettingsGroupChatReceptionOptionsResponse> {
    const groupSeatIds = uniquePositiveIds(payload.groupChatIds);

    if (groupSeatIds.length === 0) {
      throw new BadRequestError("INVALID_GROUP_CHAT", "群聊不存在");
    }

    const groupChatRows = await this.listGroupChatRowsByIds(scope, groupSeatIds);

    if (groupChatRows.length !== groupSeatIds.length) {
      throw new BadRequestError("INVALID_GROUP_CHAT", "群聊不存在");
    }

    const selectableByGroupSeatId =
      await this.listSelectableReceptionManagedAccountsByGroupSeatId(scope, groupChatRows);

    return {
      availableManagedAccounts: intersectReceptionManagedAccounts(
        groupChatRows.map(
          (row) => selectableByGroupSeatId.get(row.group_seat_id) ?? [],
        ),
      ),
    };
  }

  async updateReception(
    scope: TenantScope,
    payload: SettingsGroupChatReceptionUpdateRequest,
    javaClient: WorkbenchJavaClient,
  ): Promise<SettingsGroupChatReceptionUpdateResponse> {
    const groupSeatId = parseMySqlId(payload.groupChatId);

    if (groupSeatId == null) {
      throw new BadRequestError("INVALID_GROUP_CHAT", "群聊不存在");
    }

    if (payload.hostUserSeatIds.length > maxReceptionManagedAccountsPerGroup) {
      throw new BadRequestError(
        "RECEPTION_SEAT_LIMIT_EXCEEDED",
        `每个群聊最多选择 ${maxReceptionManagedAccountsPerGroup} 个可接待企微号`,
      );
    }

    const requestedHostUserSeatIds = uniquePositiveIds(payload.hostUserSeatIds);
    const groupChatRows = await this.listGroupChatRowsByIds(scope, [groupSeatId]);

    if (groupChatRows.length !== 1) {
      throw new BadRequestError("INVALID_GROUP_CHAT", "群聊不存在");
    }

    const selectableByGroupSeatId =
      await this.listSelectableReceptionManagedAccountsByGroupSeatId(scope, groupChatRows);
    const groupChat = groupChatRows[0];

    if (!groupChat) {
      throw new BadRequestError("INVALID_GROUP_CHAT", "群聊不存在");
    }

    const selectableIds = new Set(
      (selectableByGroupSeatId.get(groupChat.group_seat_id) ?? []).map(
        (account) => account.id,
      ),
    );
    const hostUserSeatIds = requestedHostUserSeatIds.filter((seatId) =>
      selectableIds.has(String(seatId)),
    );

    await javaClient.setGroupSeatHostUserSeatIds({
      groupSeatId: groupChat.group_seat_id,
      hostUserSeatIds,
      platform: scope.platform,
      uid: scope.uid,
    });

    return { updated: true };
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

  private async listReceptionManagedAccountsByGroupSeatId(
    scope: TenantScope,
    groupChatRows: GroupChatRow[],
  ) {
    const hostUserSeatIds = uniquePositiveIds(
      groupChatRows.flatMap((row) => parseHostUserSeatIds(row.host_user_seat_ids)),
    );
    const seatsById = await this.listSeatsByIds(scope, hostUserSeatIds);
    const accountsByGroupSeatId = new Map<
      number,
      SettingsGroupChat["receptionManagedAccounts"]
    >();

    for (const row of groupChatRows) {
      const accounts: SettingsGroupChat["receptionManagedAccounts"] = [];
      const seenSeatIds = new Set<string>();

      for (const seatId of parseHostUserSeatIds(row.host_user_seat_ids)) {
        const seatKey = String(seatId);

        if (seenSeatIds.has(seatKey)) {
          continue;
        }

        const seat = seatsById.get(seatId);

        if (!seat) {
          continue;
        }

        seenSeatIds.add(seatKey);
        accounts.push({
          avatarUrl: seat.third_avatar || "",
          id: seatKey,
          name: seat.third_user_name || "未命名托管账号",
        });
      }

      accountsByGroupSeatId.set(row.group_seat_id, accounts);
    }

    return accountsByGroupSeatId;
  }

  private async listSelectableReceptionManagedAccountsByGroupSeatId(
    scope: TenantScope,
    groupChatRows: GroupChatRow[],
  ) {
    const groupSeatIds = groupChatRows.map((row) => row.group_seat_id);

    if (groupSeatIds.length === 0) {
      return new Map<number, SettingsGroupChatReceptionManagedAccount[]>();
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
      SettingsGroupChatReceptionManagedAccount[]
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

  private async listSeatsByIds(scope: TenantScope, seatIds: number[]) {
    if (seatIds.length === 0) {
      return new Map<number, SeatIdentityRow>();
    }

    const rows = (await this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select(["seat.id", "seat.third_avatar", "seat.third_user_name"])
      .where("seat.uid", "=", scope.uid)
      .where("seat.platform", "=", scope.platform)
      .where("seat.id", "in", seatIds)
      .execute()) as SeatIdentityRow[];

    return new Map(rows.map((row) => [row.id, row] as const));
  }

  private listGroupChatRowsByIds(scope: TenantScope, groupSeatIds: number[]) {
    return this.db
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
        "group_seat.host_user_seat_ids as host_user_seat_ids",
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
      .where("group_seat.id", "in", groupSeatIds)
      .execute() as Promise<GroupChatRow[]>;
  }

  private buildGroupChatRowsQuery(scope: TenantScope, query: SettingsGroupChatsQuery) {
    let groupQuery = this.db
      .selectFrom("xy_wap_embed_group_seat as group_seat")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "group_seat.third_userid")
          .onRef("seat.uid", "=", "group_seat.uid")
          .onRef("seat.platform", "=", "group_seat.platform"),
      )
      .where("group_seat.uid", "=", scope.uid)
      .where("group_seat.platform", "=", scope.platform)
      .where("group_seat.biz_status", "=", dbActiveStatus);

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

    return groupQuery;
  }

  private async countGroupChatRows(scope: TenantScope, query: SettingsGroupChatsQuery) {
    const row = await this.buildGroupChatRowsQuery(scope, query)
      .select((expressionBuilder) =>
        expressionBuilder.fn.count<number>("group_seat.id").distinct().as("count"),
      )
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }

  private listGroupChatRows(
    scope: TenantScope,
    query: SettingsGroupChatsQuery,
    page: number,
    pageSize: number,
  ) {
    return this.buildGroupChatRowsQuery(scope, query)
      .select([
        "group_seat.avatar as avatar",
        "group_seat.id as group_seat_id",
        "group_seat.host_user_seat_ids as host_user_seat_ids",
        "group_seat.name as group_name",
        "group_seat.remark as group_remark",
        "group_seat.third_group_id as third_group_id",
        "seat.id as seat_id",
        "seat.third_avatar as seat_avatar",
        "seat.third_user_name as seat_name",
      ])
      .orderBy("group_seat.id", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute() as Promise<GroupChatRow[]>;
  }
}

export function createGroupChatSettingsService(db: Kysely<Database>) {
  return new GroupChatSettingsService(db);
}

function mapGroupChat(
  row: GroupChatRow,
  receptionManagedAccounts: SettingsGroupChat["receptionManagedAccounts"],
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
    thirdGroupId: row.third_group_id,
  };
}

function intersectReceptionManagedAccounts(
  accountLists: SettingsGroupChatReceptionManagedAccount[][],
) {
  const [firstList, ...restLists] = accountLists;

  if (!firstList) {
    return [];
  }

  const sharedAccountIds = restLists.reduce((currentIds, accounts) => {
    const accountIds = new Set(accounts.map((account) => account.id));
    return new Set([...currentIds].filter((accountId) => accountIds.has(accountId)));
  }, new Set(firstList.map((account) => account.id)));

  return firstList.filter((account) => sharedAccountIds.has(account.id));
}

function parseHostUserSeatIds(value: string | null | undefined) {
  if (value == null || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return uniquePositiveIds(parsed.map((item) => String(item)));
  } catch {
    return [];
  }
}

function uniquePositiveIds(values: Array<string | number>) {
  const ids: number[] = [];
  const seen = new Set<number>();

  for (const value of values) {
    const numericValue = parseMySqlId(value);

    if (numericValue == null || seen.has(numericValue)) {
      continue;
    }

    seen.add(numericValue);
    ids.push(numericValue);
  }

  return ids;
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

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}
