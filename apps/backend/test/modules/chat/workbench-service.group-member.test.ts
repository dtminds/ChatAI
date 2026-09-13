import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GROUP_MEMBER_TYPE,
  WORKBENCH_ENTERPRISE_MEMBER_MAX_ITEMS,
} from "@chatai/contracts";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";
import {
  createJavaClient,
  createWorkbenchService,
} from "./workbench-service.test-helpers.js";

function createPullGroupMembersRepository(input: {
  listOwnedCustomerExternalUserIds?: ReturnType<typeof vi.fn>;
  listOwnedEmployeeThirdUserIds?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    canAccessSeat: vi.fn().mockResolvedValue(true),
    getConversationLookup: vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      seatHostSubUserId: "101",
      thirdUserId: "seat-owner",
      uid: 9001,
    }),
    listGroupMembers: vi.fn().mockResolvedValue({
      conversationId: "88",
      groupSeatId: "501",
      items: [],
      thirdGroupId: "group-1",
    }),
    listOwnedCustomerExternalUserIds:
      input.listOwnedCustomerExternalUserIds ?? vi.fn().mockResolvedValue([]),
    listOwnedEmployeeThirdUserIds:
      input.listOwnedEmployeeThirdUserIds ?? vi.fn().mockResolvedValue([]),
  } as unknown as WorkbenchRepository;
}

function createKickGroupMembersRepository(input: {
  currentSeatThirdUserId?: string;
  items: Array<{
    isOpeningAccount?: boolean;
    isReceptionAccount?: boolean;
    thirdUserId: string;
    type: number;
  }>;
}) {
  const currentSeatThirdUserId = input.currentSeatThirdUserId ?? "seat-owner";

  return {
    canAccessSeat: vi.fn().mockResolvedValue(true),
    getConversationLookup: vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      seatHostSubUserId: "101",
      thirdUserId: currentSeatThirdUserId,
      uid: 9001,
    }),
    listGroupMembers: vi.fn().mockResolvedValue({
      conversationId: "88",
      groupSeatId: "501",
      items: input.items.map((item) => ({
        avatarUrl: "",
        displayName: item.thirdUserId,
        thirdUserId: item.thirdUserId,
        type: item.type,
        ...(item.isOpeningAccount ? { isOpeningAccount: true } : {}),
        ...(item.isReceptionAccount ? { isReceptionAccount: true } : {}),
      })),
      thirdGroupId: "group-1",
    }),
  } as unknown as WorkbenchRepository;
}

describe("MysqlWorkbenchService group member facade", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects pulling group members when the conversation seat is not taken over", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "202",
          uid: 9001,
        }),
        listGroupMembers: vi.fn(),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.pullGroupMembers("101", "88", {
        contactThirdUserIds: ["external-a"],
      }),
    ).rejects.toMatchObject({
      code: "SEAT_NOT_TAKEN_OVER",
      statusCode: 403,
    });
    expect(javaClient.pullFriendsInGroup).not.toHaveBeenCalled();
  });

  it("rejects pulling group members without contacts or employees", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService({} as unknown as WorkbenchRepository, javaClient);

    await expect(
      service.pullGroupMembers("101", "88", {
        contactThirdUserIds: ["  ", ""],
        thirdUserIds: [" "],
      }),
    ).rejects.toMatchObject({
      code: "CONTACT_REQUIRED",
      statusCode: 400,
    });
    expect(javaClient.pullFriendsInGroup).not.toHaveBeenCalled();
  });

  it("pulls selected customers into a taken-over group through Java", async () => {
    const javaClient = createJavaClient();
    const listOwnedCustomerExternalUserIds = vi
      .fn()
      .mockResolvedValue(["external-a", "external-b"]);
    const service = createWorkbenchService(
      createPullGroupMembersRepository({
        listOwnedCustomerExternalUserIds,
      }),
      javaClient,
    );

    await expect(
      service.pullGroupMembers("101", "88", {
        contactThirdUserIds: ["external-a", " external-a ", "external-b"],
      }),
    ).resolves.toEqual({
      conversationId: "88",
    });
    expect(listOwnedCustomerExternalUserIds).toHaveBeenCalledWith({
      platform: 5,
      seatThirdUserId: "seat-owner",
      thirdExternalUserIds: ["external-a", "external-b"],
      uid: 9001,
    });
    expect(javaClient.pullFriendsInGroup).toHaveBeenCalledWith({
      contactThirdUserids: ["external-a", "external-b"],
      groupSeatId: 501,
      platform: 5,
      subUserId: 101,
      uid: 9001,
    });
  });

  it("pulls selected employees into a taken-over group through Java", async () => {
    const javaClient = createJavaClient();
    const listOwnedEmployeeThirdUserIds = vi.fn().mockResolvedValue(["seat-user-hua"]);
    const service = createWorkbenchService(
      createPullGroupMembersRepository({
        listOwnedEmployeeThirdUserIds,
      }),
      javaClient,
    );

    await expect(
      service.pullGroupMembers("101", "88", {
        thirdUserIds: [" seat-user-hua "],
      }),
    ).resolves.toEqual({
      conversationId: "88",
    });
    expect(listOwnedEmployeeThirdUserIds).toHaveBeenCalledWith({
      platform: 5,
      thirdUserIds: ["seat-user-hua"],
      uid: 9001,
    });
    expect(javaClient.pullFriendsInGroup).toHaveBeenCalledWith({
      groupSeatId: 501,
      platform: 5,
      subUserId: 101,
      thirdUserids: ["seat-user-hua"],
      uid: 9001,
    });
  });

  it("pulls customers and employees in separate Java fields after ownership checks", async () => {
    const javaClient = createJavaClient();
    const listOwnedCustomerExternalUserIds = vi.fn().mockResolvedValue(["external-a"]);
    const listOwnedEmployeeThirdUserIds = vi.fn().mockResolvedValue(["seat-user-hua"]);
    const service = createWorkbenchService(
      createPullGroupMembersRepository({
        listOwnedCustomerExternalUserIds,
        listOwnedEmployeeThirdUserIds,
      }),
      javaClient,
    );

    await expect(
      service.pullGroupMembers("101", "88", {
        contactThirdUserIds: ["external-a"],
        thirdUserIds: ["seat-user-hua"],
      }),
    ).resolves.toEqual({
      conversationId: "88",
    });
    expect(javaClient.pullFriendsInGroup).toHaveBeenCalledWith({
      contactThirdUserids: ["external-a"],
      groupSeatId: 501,
      platform: 5,
      subUserId: 101,
      thirdUserids: ["seat-user-hua"],
      uid: 9001,
    });
  });

  it("rejects pulling customers that do not belong to the current seat", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      createPullGroupMembersRepository({
        listOwnedCustomerExternalUserIds: vi.fn().mockResolvedValue(["external-a"]),
      }),
      javaClient,
    );

    await expect(
      service.pullGroupMembers("101", "88", {
        contactThirdUserIds: ["external-a", "external-b"],
      }),
    ).rejects.toMatchObject({
      code: "CUSTOMER_NOT_OWNED",
      statusCode: 403,
    });
    expect(javaClient.pullFriendsInGroup).not.toHaveBeenCalled();
  });

  it("rejects pulling employees that are not current-enterprise seats", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      createPullGroupMembersRepository({
        listOwnedEmployeeThirdUserIds: vi.fn().mockResolvedValue([]),
      }),
      javaClient,
    );

    await expect(
      service.pullGroupMembers("101", "88", {
        thirdUserIds: ["seat-user-hua"],
      }),
    ).rejects.toMatchObject({
      code: "EMPLOYEE_NOT_OWNED",
      statusCode: 403,
    });
    expect(javaClient.pullFriendsInGroup).not.toHaveBeenCalled();
  });

  it("rejects pulling more friends than the invite limit", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService({} as unknown as WorkbenchRepository, javaClient);

    await expect(
      service.pullGroupMembers("101", "88", {
        contactThirdUserIds: Array.from(
          { length: 21 },
          (_, index) => `external-${index + 1}`,
        ),
        thirdUserIds: Array.from(
          { length: 20 },
          (_, index) => `seat-${index + 1}`,
        ),
      }),
    ).rejects.toMatchObject({
      code: "CONTACT_LIMIT",
      statusCode: 400,
    });
    expect(javaClient.pullFriendsInGroup).not.toHaveBeenCalled();
  });

  it("lists only ChatAI seats of the current enterprise as add-group employees", async () => {
    const javaClient = createJavaClient();
    const listTenantSeatIdentities = vi.fn().mockResolvedValue([
      {
        avatarUrl: "https://example.com/seat-hua.png",
        displayName: "席位花花",
        thirdUserId: "seat-user-hua",
        userId: 201,
      },
      {
        avatarUrl: "",
        displayName: "饭饭",
        thirdUserId: "seat-user-fan",
        userId: 301,
      },
      {
        avatarUrl: "",
        displayName: "重复席位",
        thirdUserId: "seat-user-hua",
        userId: 401,
      },
    ]);
    const service = createWorkbenchService(
      { listTenantSeatIdentities } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.getEnterpriseMembers("101")).resolves.toEqual({
      items: [
        {
          avatarUrl: "",
          displayName: "饭饭",
          thirdUserId: "seat-user-fan",
        },
        {
          avatarUrl: "https://example.com/seat-hua.png",
          displayName: "席位花花",
          thirdUserId: "seat-user-hua",
        },
      ],
    });
    expect(javaClient.listEnterpriseDepartmentUsers).not.toHaveBeenCalled();
    expect(listTenantSeatIdentities).toHaveBeenCalledOnce();
    expect(listTenantSeatIdentities).toHaveBeenCalledWith({
      platform: 5,
      uid: 9001,
    });
  });

  it("caps enterprise members at the documented catalog limit", async () => {
    const javaClient = createJavaClient();
    const catalogSize = WORKBENCH_ENTERPRISE_MEMBER_MAX_ITEMS + 1;
    const listTenantSeatIdentities = vi.fn().mockResolvedValue(
      Array.from({ length: catalogSize }, (_, index) => ({
        avatarUrl: "",
        displayName: `成员${String(index + 1).padStart(4, "0")}`,
        thirdUserId: `third-${index + 1}`,
        userId: index + 1,
      })),
    );
    const service = createWorkbenchService(
      { listTenantSeatIdentities } as unknown as WorkbenchRepository,
      javaClient,
    );

    const response = await service.getEnterpriseMembers("101");

    expect(response.items).toHaveLength(WORKBENCH_ENTERPRISE_MEMBER_MAX_ITEMS);
    expect(javaClient.listEnterpriseDepartmentUsers).not.toHaveBeenCalled();
    expect(listTenantSeatIdentities).toHaveBeenCalledOnce();
  });

  it("rejects kicking a group member when the conversation seat is not taken over", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "202",
          uid: 9001,
        }),
        listGroupMembers: vi.fn(),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.kickGroupMember("101", "88", {
        kickOutThirdUserId: "member-xiaoming",
      }),
    ).rejects.toMatchObject({
      code: "SEAT_NOT_TAKEN_OVER",
      statusCode: 403,
    });
    expect(javaClient.kickOutOfGroup).not.toHaveBeenCalled();
  });

  it("rejects kicking a group member without a member id", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService({} as unknown as WorkbenchRepository, javaClient);

    await expect(
      service.kickGroupMember("101", "88", {
        kickOutThirdUserId: "  ",
      }),
    ).rejects.toMatchObject({
      code: "MEMBER_REQUIRED",
      statusCode: 400,
    });
    expect(javaClient.kickOutOfGroup).not.toHaveBeenCalled();
  });

  it.each([
    { role: "owner", type: GROUP_MEMBER_TYPE.OWNER },
    { role: "admin", type: GROUP_MEMBER_TYPE.ADMIN },
  ] as const)(
    "kicks a group member when the current seat is a group $role",
    async ({ type }) => {
      const javaClient = createJavaClient();
      const service = createWorkbenchService(
        createKickGroupMembersRepository({
          items: [
            {
              isReceptionAccount: true,
              thirdUserId: "seat-owner",
              type,
            },
            {
              thirdUserId: "member-xiaoming",
              type: GROUP_MEMBER_TYPE.NORMAL,
            },
          ],
        }),
        javaClient,
      );

      await expect(
        service.kickGroupMember("101", "88", {
          kickOutThirdUserId: " member-xiaoming ",
        }),
      ).resolves.toEqual({
        conversationId: "88",
      });
      expect(javaClient.kickOutOfGroup).toHaveBeenCalledWith({
        groupSeatId: 501,
        kickOutThirdUserid: "member-xiaoming",
        platform: 5,
        subUserId: 101,
        uid: 9001,
      });
    },
  );

  it("rejects kicking a group member when the current seat is a regular member", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      createKickGroupMembersRepository({
        currentSeatThirdUserId: "seat-member",
        items: [
          {
            isReceptionAccount: true,
            thirdUserId: "seat-member",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
          {
            thirdUserId: "member-xiaoming",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ],
      }),
      javaClient,
    );

    await expect(
      service.kickGroupMember("101", "88", {
        kickOutThirdUserId: "member-xiaoming",
      }),
    ).rejects.toMatchObject({
      code: "GROUP_KICK_FORBIDDEN",
      statusCode: 403,
    });
    expect(javaClient.kickOutOfGroup).not.toHaveBeenCalled();
  });

  it.each([
    {
      kickOutThirdUserId: "member-owner",
      label: "owner",
      target: {
        thirdUserId: "member-owner",
        type: GROUP_MEMBER_TYPE.OWNER,
      },
    },
    {
      kickOutThirdUserId: "member-admin",
      label: "admin",
      target: {
        thirdUserId: "member-admin",
        type: GROUP_MEMBER_TYPE.ADMIN,
      },
    },
    {
      kickOutThirdUserId: "member-opening",
      label: "opening account",
      target: {
        isOpeningAccount: true,
        thirdUserId: "member-opening",
        type: GROUP_MEMBER_TYPE.NORMAL,
      },
    },
  ] as const)(
    "rejects kicking a group $label",
    async ({ kickOutThirdUserId, target }) => {
      const javaClient = createJavaClient();
      const service = createWorkbenchService(
        createKickGroupMembersRepository({
          items: [
            {
              isReceptionAccount: true,
              thirdUserId: "seat-owner",
              type: GROUP_MEMBER_TYPE.OWNER,
            },
            target,
          ],
        }),
        javaClient,
      );

      await expect(
        service.kickGroupMember("101", "88", {
          kickOutThirdUserId,
        }),
      ).rejects.toMatchObject({
        code: "GROUP_MEMBER_NOT_REMOVABLE",
        statusCode: 403,
      });
      expect(javaClient.kickOutOfGroup).not.toHaveBeenCalled();
    },
  );

  it("rejects kicking a group member that is not in the group", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      createKickGroupMembersRepository({
        items: [
          {
            isReceptionAccount: true,
            thirdUserId: "seat-owner",
            type: GROUP_MEMBER_TYPE.OWNER,
          },
        ],
      }),
      javaClient,
    );

    await expect(
      service.kickGroupMember("101", "88", {
        kickOutThirdUserId: "member-xiaoming",
      }),
    ).rejects.toMatchObject({
      code: "GROUP_MEMBER_NOT_FOUND",
      statusCode: 404,
    });
    expect(javaClient.kickOutOfGroup).not.toHaveBeenCalled();
  });

});
