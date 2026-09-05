import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../../../src/plugins/error-handler";
import { UnauthorizedError } from "../../../src/shared/errors";
import { createOrderQueryResourceJavaClient } from "../../../src/modules/workflow/order-query-resource-java-client";
import { registerOrderQueryResourceRoutes } from "../../../src/modules/workflow/order-query-resource.routes";

describe("workflow order query resource routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires authentication before loading order resources", async () => {
    const listPlatforms = vi.fn();
    const app = await createResourceApp({ listPlatforms });

    const response = await app.inject({
      method: "GET",
      url: "/api/server/workflow/order-platforms",
    });

    expect(response.statusCode).toBe(401);
    expect(listPlatforms).not.toHaveBeenCalled();
    await app.close();
  });

  it("serves platform, shop, and order status resources", async () => {
    const listPlatforms = vi.fn().mockResolvedValue([{ id: 2, name: "视频号" }]);
    const listOrderStatuses = vi.fn().mockResolvedValue([{ name: "待付款", status: 0 }]);
    const listShops = vi.fn().mockResolvedValue([{ id: 11, model: 1, name: "旗舰店", platformId: 2 }]);
    const app = await createResourceApp({ listOrderStatuses, listPlatforms, listShops });

    const platforms = await app.inject({
      headers: { authorization: "Bearer test-token" },
      method: "GET",
      url: "/api/server/workflow/order-platforms",
    });
    const shops = await app.inject({
      headers: { authorization: "Bearer test-token" },
      method: "GET",
      url: "/api/server/workflow/order-shops?platformIds=2,2",
    });
    const statuses = await app.inject({
      headers: { authorization: "Bearer test-token" },
      method: "GET",
      url: "/api/server/workflow/order-statuses",
    });

    expect(platforms.json()).toEqual({
      data: { platforms: [{ id: 2, name: "视频号" }] },
      success: true,
    });
    expect(shops.json()).toEqual({
      data: { shops: [{ id: 11, model: 1, name: "旗舰店", platformId: 2 }] },
      success: true,
    });
    expect(statuses.json()).toEqual({
      data: { statuses: [{ name: "待付款", status: 0 }] },
      success: true,
    });
    expect(listPlatforms).toHaveBeenCalledWith(9001);
    expect(listOrderStatuses).toHaveBeenCalledWith();
    expect(listShops).toHaveBeenCalledWith(9001, [2]);
    await app.close();
  });

  it("loads all authorized shops when the platform filter is omitted", async () => {
    const listShops = vi.fn().mockResolvedValue([]);
    const app = await createResourceApp({ listShops });

    const response = await app.inject({
      headers: { authorization: "Bearer test-token" },
      method: "GET",
      url: "/api/server/workflow/order-shops",
    });

    expect(response.statusCode).toBe(200);
    expect(listShops).toHaveBeenCalledWith(9001, undefined);
    await app.close();
  });

  it("maps Java platform, order status, and authorized shop payloads", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    vi.stubEnv("JAVA_INTERNAL_API_TOKEN", "internal-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/cdp-platform/list-platform")) {
        return jsonResponse({
          data: [{ id: 2, name: "视频号" }, { id: 0, name: "无效平台" }],
          success: true,
        });
      }
      if (path.endsWith("/cdp-order/select-order-status")) {
        return jsonResponse({
          data: [{ name: "待付款", status: 0 }, { name: "无效状态", status: -1 }],
          success: true,
        });
      }
      return jsonResponse({
        data: [
          { auth: true, platformId: 2, shopId: 11, shopModel: 1, shopName: "旗舰店", status: 0, uid: 9001 },
          { auth: false, platformId: 2, shopId: 12, shopModel: 1, shopName: "未授权店铺", status: 0, uid: 9001 },
        ],
        success: true,
      });
    });
    const client = createOrderQueryResourceJavaClient();

    await expect(client.listPlatforms(9001)).resolves.toEqual([{ id: 2, name: "视频号" }]);
    await expect(client.listOrderStatuses()).resolves.toEqual([{ name: "待付款", status: 0 }]);
    await expect(client.listShops(9001, [2])).resolves.toEqual([
      { id: 11, model: 1, name: "旗舰店", platformId: 2 },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://java.internal/third-internal/cdp-platform/list-platform",
      expect.objectContaining({
        body: JSON.stringify({ uid: 9001 }),
        headers: expect.objectContaining({ authorization: "Bearer internal-token" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://java.internal/third-internal/cdp-order/select-order-status",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://java.internal/third-internal/cdp-shop/list-auth-shop",
      expect.objectContaining({
        body: JSON.stringify({ platformIds: [2], uid: 9001 }),
        method: "POST",
      }),
    );
  });

  it("omits platformIds when loading all authorized shops from Java", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      data: [],
      success: true,
    }));
    const client = createOrderQueryResourceJavaClient();

    await expect(client.listShops(9001)).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/cdp-shop/list-auth-shop",
      expect.objectContaining({
        body: JSON.stringify({ uid: 9001 }),
        method: "POST",
      }),
    );
  });
});

async function createResourceApp(overrides: {
  listOrderStatuses?: ReturnType<typeof vi.fn>;
  listPlatforms?: ReturnType<typeof vi.fn>;
  listShops?: ReturnType<typeof vi.fn>;
}) {
  const app = Fastify({ logger: false });
  await registerErrorHandler(app);
  app.decorate("authenticate", async (request: { headers: { authorization?: string }; user?: unknown }) => {
    if (!request.headers.authorization) throw new UnauthorizedError();
    request.user = {
      roles: ["admin"],
      sessionId: "501",
      sessionVersion: 1,
      subUserId: "1",
      uid: 9001,
    };
  });
  await registerOrderQueryResourceRoutes(app, () => ({
    listOrderStatuses: overrides.listOrderStatuses ?? vi.fn().mockResolvedValue([]),
    listPlatforms: overrides.listPlatforms ?? vi.fn().mockResolvedValue([]),
    listShops: overrides.listShops ?? vi.fn().mockResolvedValue([]),
  }));
  return app;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
