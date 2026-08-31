import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKFLOW_WECOM_MEMBER_MAX_NODES } from "@chatai/contracts";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";
import { WecomMemberService } from "../../../src/modules/workflow/wecom-member.service.js";

async function createAuthenticatedApp() {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: ["admin"],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
    uid: 9001,
  });
  app.db = createKbReadDbMock() as never;

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

describe("workflow wecom-member routes", () => {
  let app: Awaited<ReturnType<typeof buildMockedApp>> | undefined;

  beforeEach(() => {
    app = undefined;
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    process.env.JAVA_INTERNAL_API_TOKEN = "java-token";
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it("lists the WeCom member tree from the Java department catalog", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            roots: [
              {
                children: [
                  {
                    avatar: "https://example.com/a.png",
                    key: "1_201",
                    title: "张三",
                    type: 1,
                    userKey: "201",
                  },
                  {
                    key: "1_duplicate",
                    title: "重复节点",
                    type: 1,
                    userKey: "201",
                  },
                  {
                    key: "",
                    title: "无效成员",
                    type: 1,
                    userKey: "202",
                  },
                  {
                    key: "1_203",
                    notLicense: true,
                    title: "未开通许可",
                    type: 1,
                    userKey: "203",
                  },
                  {
                    key: "1_204",
                    title: "不可见成员",
                    type: 1,
                    userKey: "204",
                    visible: false,
                  },
                ],
                key: "2_1",
                title: "销售部",
                type: 2,
              },
              {
                children: [],
                key: "2_empty",
                title: "空部门",
                type: 2,
              },
            ],
            userLimit: 80,
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/wecom-members",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        memberLimit: 80,
        roots: [
          {
            children: [
              {
                avatarUrl: "https://example.com/a.png",
                children: [],
                id: "1_201",
                kind: "member",
                title: "张三",
                workUserId: 201,
              },
              {
                children: [],
                id: "1_duplicate",
                kind: "member",
                title: "重复节点",
                workUserId: 201,
              },
              {
                children: [],
                id: "1_203",
                kind: "member",
                selectable: false,
                title: "未开通许可",
                workUserId: 203,
              },
            ],
            id: "2_1",
            kind: "department",
            title: "销售部",
          },
        ],
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/work-party/get-all-department-user");
    expect(init).toMatchObject({
      headers: expect.objectContaining({
        authorization: "Bearer java-token",
        "content-type": "application/json",
      }),
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      isExternal: 1,
      isLicense: 0,
      selectType: 2,
      status: 1,
      uid: 9001,
      withDefaultRootDepart: true,
    });
  });

  it("resolves requested member summaries for workflow list previews", async () => {
    const listDepartmentUsers = vi.fn().mockResolvedValue({
      roots: [{
        children: [
          {
            avatar: "https://example.com/a.png",
            children: [],
            key: "1_201",
            title: "张三",
            type: 1,
            userKey: "201",
          },
          {
            children: [],
            key: "1_202",
            title: "李四",
            type: 1,
            userKey: "202",
          },
        ],
        key: "2_1",
        title: "销售部",
        type: 2,
      }],
    });
    const service = new WecomMemberService({ listDepartmentUsers });

    await expect(service.findByIds(9001, [201, 999])).resolves.toEqual(new Map([
      [201, {
        avatarUrl: "https://example.com/a.png",
        id: 201,
        name: "张三",
      }],
    ]));
    expect(listDepartmentUsers).toHaveBeenCalledOnce();
    expect(listDepartmentUsers).toHaveBeenCalledWith({ uid: 9001 });
  });

  it("caps the mapped tree at the documented node bound", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            roots: Array.from({ length: WORKFLOW_WECOM_MEMBER_MAX_NODES + 50 }, (_, index) => ({
              key: `1_${index + 1}`,
              title: `成员 ${index + 1}`,
              type: 1,
              userKey: String(index + 1),
            })),
          },
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/wecom-members",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.roots).toHaveLength(WORKFLOW_WECOM_MEMBER_MAX_NODES);
    expect(response.json().data.roots[0]).toEqual({
      children: [],
      id: "1_1",
      kind: "member",
      title: "成员 1",
      workUserId: 1,
    });
    expect(response.json().data.roots[WORKFLOW_WECOM_MEMBER_MAX_NODES - 1]).toEqual({
      children: [],
      id: `1_${WORKFLOW_WECOM_MEMBER_MAX_NODES}`,
      kind: "member",
      title: `成员 ${WORKFLOW_WECOM_MEMBER_MAX_NODES}`,
      workUserId: WORKFLOW_WECOM_MEMBER_MAX_NODES,
    });
  });

  it("maps Java authentication failures to bad gateway", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "service token expired" }), {
        headers: { "content-type": "application/json" },
        status: 401,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/wecom-members",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "WECOM_MEMBER_INTERNAL_API_FAILED",
        message: "操作失败，请稍后重试",
      },
      success: false,
    });
  });

  it("does not expose Java failure details to the browser", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        error: 62001,
        errorMsg: "internal entitlement detail",
        success: false,
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/wecom-members",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "WECOM_MEMBER_INTERNAL_API_FAILED",
        message: "操作失败，请稍后重试",
      },
      success: false,
    });
  });
});
