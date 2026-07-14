import { describe, expect, it, vi } from "vitest";
import { GroupChatSettingsService } from "../../../src/modules/settings/group-chats.service.js";

describe("GroupChatSettingsService", () => {
  it("lists enabled group chats with opening managed account and reception seats from host_user_seat_ids", async () => {
    const service = new GroupChatSettingsService(createDbMock() as never);

    const result = await service.list({ platform: 5, uid: 9001 });

    expect(result).toEqual({
      filterManagedAccounts: [
        { id: "101", name: "德瑞可" },
        { id: "102", name: "念都堂" },
      ],
      groupChats: [
        {
          avatarUrl: "https://example.com/group-1.png",
          id: "501",
          name: "护肤交流群",
          openingManagedAccount: {
            avatarUrl: "https://example.com/drc.png",
            id: "101",
            name: "德瑞可",
          },
          receptionManagedAccounts: [
            {
              avatarUrl: "https://example.com/ndt.png",
              id: "102",
              name: "念都堂",
            },
          ],
          receptionSeatCount: 1,
          selectableReceptionManagedAccounts: [
            {
              avatarUrl: "https://example.com/ndt.png",
              id: "102",
              name: "念都堂",
            },
          ],
          thirdGroupId: "29F71A2ED8125854B6A1",
        },
        {
          avatarUrl: "",
          id: "502",
          name: "售后答疑群",
          openingManagedAccount: {
            avatarUrl: "https://example.com/ndt.png",
            id: "102",
            name: "念都堂",
          },
          receptionManagedAccounts: [
            {
              avatarUrl: "https://example.com/drc.png",
              id: "101",
              name: "德瑞可",
            },
          ],
          receptionSeatCount: 1,
          selectableReceptionManagedAccounts: [
            {
              avatarUrl: "https://example.com/drc.png",
              id: "101",
              name: "德瑞可",
            },
          ],
          thirdGroupId: "8C2D4F1A9B7765432100",
        },
        {
          avatarUrl: "",
          id: "503",
          name: "护肤交流群 2",
          openingManagedAccount: {
            avatarUrl: "https://example.com/ndt.png",
            id: "102",
            name: "念都堂",
          },
          receptionManagedAccounts: [],
          receptionSeatCount: 0,
          selectableReceptionManagedAccounts: [
            {
              avatarUrl: "https://example.com/drc.png",
              id: "101",
              name: "德瑞可",
            },
          ],
          thirdGroupId: "29F71A2ED8125854B6A1",
        },
      ],
    });
  });

  it("filters group chats by keyword and opening managed account", async () => {
    const service = new GroupChatSettingsService(createDbMock() as never);

    const result = await service.list(
      { platform: 5, uid: 9001 },
      { keyword: "售后", managedAccountId: "102" },
    );

    expect(result.groupChats).toEqual([
      {
        avatarUrl: "",
        id: "502",
        name: "售后答疑群",
        openingManagedAccount: {
          avatarUrl: "https://example.com/ndt.png",
          id: "102",
          name: "念都堂",
        },
        receptionManagedAccounts: [
          {
            avatarUrl: "https://example.com/drc.png",
            id: "101",
            name: "德瑞可",
          },
        ],
        receptionSeatCount: 1,
        selectableReceptionManagedAccounts: [
          {
            avatarUrl: "https://example.com/drc.png",
            id: "101",
            name: "德瑞可",
          },
        ],
        thirdGroupId: "8C2D4F1A9B7765432100",
      },
    ]);
  });

  it("lists selectable reception managed accounts from group seat members excluding opening seat", async () => {
    const service = new GroupChatSettingsService(createDbMock() as never);

    const result = await service.list({ platform: 5, uid: 9001 });

    expect(result.groupChats.find((groupChat) => groupChat.id === "501")).toMatchObject({
      openingManagedAccount: { id: "101", name: "德瑞可" },
      selectableReceptionManagedAccounts: [{ id: "102", name: "念都堂" }],
    });
    expect(
      result.groupChats
        .find((groupChat) => groupChat.id === "501")
        ?.selectableReceptionManagedAccounts.some((account) => account.id === "101"),
    ).toBe(false);
  });

  it("updates reception seats through Java API and ignores seats outside each group", async () => {
    const service = new GroupChatSettingsService(createDbMock() as never);
    const setGroupSeatHostUserSeatIds = vi.fn().mockResolvedValue(undefined);

    await expect(
      service.updateReception(
        { platform: 5, uid: 9001 },
        {
          groupChatIds: ["501", "502"],
          hostUserSeatIds: ["101", "102"],
        },
        { setGroupSeatHostUserSeatIds } as never,
      ),
    ).resolves.toEqual({ updated: true });

    expect(setGroupSeatHostUserSeatIds).toHaveBeenCalledTimes(2);
    expect(setGroupSeatHostUserSeatIds).toHaveBeenNthCalledWith(1, {
      groupSeatId: 501,
      hostUserSeatIds: [102],
      platform: 5,
      uid: 9001,
    });
    expect(setGroupSeatHostUserSeatIds).toHaveBeenNthCalledWith(2, {
      groupSeatId: 502,
      hostUserSeatIds: [101],
      platform: 5,
      uid: 9001,
    });
  });
});

function createDbMock() {
  const seats = [
    {
      biz_status: 1,
      id: 101,
      platform: 5,
      third_avatar: "https://example.com/drc.png",
      third_user_name: "德瑞可",
      third_userid: "user-101",
      uid: 9001,
    },
    {
      biz_status: 1,
      id: 102,
      platform: 5,
      third_avatar: "https://example.com/ndt.png",
      third_user_name: "念都堂",
      third_userid: "user-102",
      uid: 9001,
    },
  ];
  const groupSeats = [
    {
      avatar: "https://example.com/group-1.png",
      biz_status: 1,
      host_user_seat_ids: "[102]",
      id: 501,
      name: "护肤交流群",
      platform: 5,
      remark: null,
      third_group_id: "29F71A2ED8125854B6A1",
      third_userid: "user-101",
      uid: 9001,
    },
    {
      avatar: "",
      biz_status: 1,
      host_user_seat_ids: "[101]",
      id: 502,
      name: "售后答疑群",
      platform: 5,
      remark: null,
      third_group_id: "8C2D4F1A9B7765432100",
      third_userid: "user-102",
      uid: 9001,
    },
    {
      avatar: "",
      biz_status: 1,
      host_user_seat_ids: "[]",
      id: 503,
      name: "护肤交流群 2",
      platform: 5,
      remark: null,
      third_group_id: "29F71A2ED8125854B6A1",
      third_userid: "user-102",
      uid: 9001,
    },
  ];

  const groupMembers = [
    {
      biz_status: 1,
      group_seat_id: 501,
      platform: 5,
      third_userid: "user-101",
      uid: 9001,
    },
    {
      biz_status: 1,
      group_seat_id: 501,
      platform: 5,
      third_userid: "user-102",
      uid: 9001,
    },
    {
      biz_status: 1,
      group_seat_id: 502,
      platform: 5,
      third_userid: "user-102",
      uid: 9001,
    },
    {
      biz_status: 1,
      group_seat_id: 502,
      platform: 5,
      third_userid: "user-101",
      uid: 9001,
    },
    {
      biz_status: 1,
      group_seat_id: 503,
      platform: 5,
      third_userid: "user-102",
      uid: 9001,
    },
    {
      biz_status: 1,
      group_seat_id: 503,
      platform: 5,
      third_userid: "user-101",
      uid: 9001,
    },
  ];

  return {
    selectFrom(table: string) {
      if (table === "xy_wap_embed_user_seat as seat") {
        return createSeatQueryBuilder(seats);
      }

      if (table === "xy_wap_embed_group_seat as group_seat") {
        return createGroupSeatListBuilder(groupSeats, seats);
      }

      if (table === "xy_wap_embed_group_member as member") {
        return createGroupMemberQueryBuilder(groupMembers, seats);
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function createSeatQueryBuilder(seats: Array<{
  biz_status?: number;
  id: number;
  platform: number;
  third_avatar?: string;
  third_user_name: string | null;
  third_userid?: string;
  uid: number;
}>) {
  const wheres: Array<[string, string, unknown]> = [];
  const builder = {
    execute: async () =>
      seats
        .filter((seat) =>
          matchesWhere(seat, wheres, {
            "seat.biz_status": "biz_status",
            "seat.id": "id",
            "seat.platform": "platform",
            "seat.uid": "uid",
          }),
        )
        .filter((seat) =>
          wheres.every(([column, operator, value]) => {
            if (column === "seat.id" && operator === "in" && Array.isArray(value)) {
              return value.includes(seat.id);
            }

            return true;
          }),
        )
        .map((seat) => ({
          avatarUrl: seat.third_avatar ?? "",
          id: seat.id,
          name: seat.third_user_name,
          seat_avatar: seat.third_avatar ?? "",
          seat_id: seat.id,
          seat_name: seat.third_user_name,
          third_avatar: seat.third_avatar ?? "",
          third_user_name: seat.third_user_name,
        })),
    innerJoin: () => builder,
    orderBy: () => builder,
    select: () => builder,
    where: (...whereArgs: [string, string, unknown]) => {
      wheres.push(whereArgs);
      return builder;
    },
  };

  return builder;
}

function createGroupMemberQueryBuilder(
  groupMembers: Array<{
    biz_status: number;
    group_seat_id: number;
    platform: number;
    third_userid: string;
    uid: number;
  }>,
  seats: Array<{
    biz_status?: number;
    id: number;
    platform: number;
    third_avatar: string;
    third_user_name: string | null;
    third_userid: string;
    uid: number;
  }>,
) {
  const wheres: Array<[string, string, unknown]> = [];
  const builder = {
    execute: async () =>
      groupMembers
        .filter((member) =>
          wheres.every(([column, operator, value]) => {
            if (column === "member.group_seat_id" && operator === "in" && Array.isArray(value)) {
              return value.includes(member.group_seat_id);
            }

            return true;
          }),
        )
        .filter((member) =>
          matchesWhere(member, wheres, {
            "member.biz_status": "biz_status",
            "member.group_seat_id": "group_seat_id",
            "member.platform": "platform",
            "member.uid": "uid",
          }),
        )
        .map((member) => {
          const seat = seats.find(
            (item) =>
              item.third_userid === member.third_userid &&
              item.uid === member.uid &&
              item.platform === member.platform &&
              (item.biz_status ?? 1) === 1,
          );

          if (!seat) {
            return null;
          }

          return {
            group_seat_id: member.group_seat_id,
            seat_avatar: seat.third_avatar,
            seat_id: seat.id,
            seat_name: seat.third_user_name,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
        .sort((left, right) => right.seat_id - left.seat_id),
    innerJoin: () => builder,
    orderBy: () => builder,
    select: () => builder,
    where: (...whereArgs: [string, string, unknown]) => {
      wheres.push(whereArgs);
      return builder;
    },
  };

  return builder;
}

function createGroupSeatListBuilder(
  groupSeats: Array<{
    avatar: string;
    biz_status: number;
    host_user_seat_ids: string;
    id: number;
    name: string | null;
    platform: number;
    remark: string | null;
    third_group_id: string;
    third_userid: string;
    uid: number;
  }>,
  seats: Array<{
    id: number;
    platform: number;
    third_avatar: string;
    third_user_name: string | null;
    third_userid: string;
    uid: number;
  }>,
) {
  const wheres: Array<[string, string, unknown]> = [];
  const orFilters: Array<(row: {
    group_name: string | null;
    group_remark: string | null;
    third_group_id: string;
  }) => boolean> = [];
  const builder = {
    execute: async () =>
      groupSeats
        .map((groupSeat) => {
          const seat = seats.find(
            (item) =>
              item.third_userid === groupSeat.third_userid &&
              item.uid === groupSeat.uid &&
              item.platform === groupSeat.platform,
          );

          if (!seat) {
            return null;
          }

          return {
            avatar: groupSeat.avatar,
            group_name: groupSeat.name,
            group_remark: groupSeat.remark,
            group_seat_id: groupSeat.id,
            host_user_seat_ids: groupSeat.host_user_seat_ids,
            seat_avatar: seat.third_avatar,
            seat_id: seat.id,
            seat_name: seat.third_user_name,
            third_group_id: groupSeat.third_group_id,
            user_seat_id: seat.id,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
        .filter((row) => {
          const seatId = wheres.find(([column]) => column === "seat.id")?.[2];
          const groupSeatIdFilter = wheres.find(([column]) => column === "group_seat.id")?.[2];
          const thirdGroupIdFilter = wheres.find(
            ([column]) => column === "group_seat.third_group_id",
          )?.[2];

          if (seatId !== undefined && row.seat_id !== seatId) {
            return false;
          }

          if (
            Array.isArray(groupSeatIdFilter) &&
            !groupSeatIdFilter.includes(row.group_seat_id)
          ) {
            return false;
          }

          if (
            typeof groupSeatIdFilter === "number" &&
            row.group_seat_id !== groupSeatIdFilter
          ) {
            return false;
          }

          if (
            typeof thirdGroupIdFilter === "string" &&
            row.third_group_id !== thirdGroupIdFilter
          ) {
            return false;
          }

          if (
            wheres.some(([column, , value]) => column === "group_seat.uid" && value !== 9001) ||
            wheres.some(([column, , value]) => column === "group_seat.platform" && value !== 5) ||
            wheres.some(([column, , value]) => column === "group_seat.biz_status" && value !== 1)
          ) {
            return false;
          }

          return orFilters.length === 0 || orFilters.some((filter) => filter(row));
        }),
    innerJoin: () => builder,
    limit: () => builder,
    orderBy: () => builder,
    select: () => builder,
    where: (...whereArgs: [string, string, unknown] | [Function]) => {
      if (typeof whereArgs[0] === "function") {
        type Condition = { column: string; operator: string; value: string };
        const expressionBuilder = Object.assign(
          (column: string, operator: string, value: string) => ({
            column,
            operator,
            value,
          }),
          {
            or: (conditions: Condition[]) => conditions,
          },
        );
        const conditions = whereArgs[0](expressionBuilder) as Condition[];

        orFilters.push((row) =>
          conditions.some((condition) => {
            const sourceValue =
              condition.column === "group_seat.name"
                ? row.group_name
                : condition.column === "group_seat.remark"
                  ? row.group_remark
                  : row.third_group_id;
            const keyword = condition.value.replace(/^%/, "").replace(/%$/, "");

            return sourceValue?.includes(keyword) ?? false;
          }),
        );
      } else {
        wheres.push(whereArgs as [string, string, unknown]);
      }

      return builder;
    },
  };

  return builder;
}

function matchesWhere<T extends Record<string, unknown>>(
  row: T,
  wheres: Array<[string, string, unknown]>,
  columnMap: Record<string, keyof T>,
) {
  return wheres.every(([column, operator, value]) => {
    if (operator === "in") {
      return true;
    }

    const rowKey = columnMap[column];

    if (rowKey === undefined) {
      return true;
    }

    return row[rowKey] === value;
  });
}
