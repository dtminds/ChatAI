import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  WorkbenchCustomerDetailResponseSchema,
  WorkbenchCustomerListResponseSchema,
  WorkbenchCustomerRelationConversationsResponseSchema,
} from "../src/chat/dto";

describe("chat customer DTOs", () => {
  it("accepts customer list responses with aggregated visible seat relations", () => {
    expect(
      Value.Check(WorkbenchCustomerListResponseSchema, {
        hasMore: true,
        items: [
          {
            avatar: "https://example.com/customer.png",
            bizStatus: 0,
            customerKey: "uid-1:5:external-1",
            gender: 1,
            name: "微信客户",
            platform: 5,
            realName: "张三",
            relationCount: 2,
            lastMessageTime: 1_779_600_000_000,
            lastConversation: {
              conversationId: "701",
              lastMessageTime: 1_779_600_000_000,
              seatAvatar: "https://example.com/seat-a.png",
              seatId: "101",
              seatName: "销售一号",
            },
            seatRelations: [
              {
                bindId: "301",
                bindStatus: 1,
                bindType: 1,
                lastMessageTime: 1_779_600_000_000,
                seatAvatar: "https://example.com/seat-a.png",
                seatId: "101",
                seatName: "销售一号",
                thirdUserId: "wm-seat-a",
              },
            ],
            thirdExternalUserId: "external-1",
            uid: 1,
          },
        ],
        nextCursor: "cursor-1",
        total: 1,
      }),
    ).toBe(true);
  });

  it("accepts customer details with full relation rows", () => {
    expect(
      Value.Check(WorkbenchCustomerDetailResponseSchema, {
        customer: {
          avatar: "",
          bizStatus: 1,
          customerKey: "uid-1:5:external-1",
          gender: null,
          name: "微信客户",
          platform: 5,
          realName: "",
          relationCount: 2,
          lastMessageTime: 1_779_600_000_000,
          seatRelations: [
            {
              addTime: 1_779_600_000,
              bindId: "301",
              bindStatus: 1,
              bindType: 1,
              description: "重点客户",
              seatAvatar: "",
              seatId: "101",
              seatName: "销售一号",
              thirdUserId: "wm-seat-a",
            },
            {
              bindId: "302",
              bindStatus: 0,
              bindType: 2,
              seatAvatar: "",
              seatId: "102",
              seatName: "销售二号",
              thirdUserId: "wm-seat-b",
            },
          ],
          thirdExternalUserId: "external-1",
          uid: 1,
        },
      }),
    ).toBe(true);
  });

  it("accepts customer relation conversation timestamps", () => {
    expect(
      Value.Check(WorkbenchCustomerRelationConversationsResponseSchema, {
        items: [
          {
            lastMessageTime: 1_779_600_000_000,
            thirdUserId: "wm-seat-a",
          },
        ],
      }),
    ).toBe(true);
  });
});
