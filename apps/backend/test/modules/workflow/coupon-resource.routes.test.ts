import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../../../src/plugins/error-handler.js";
import { UnauthorizedError } from "../../../src/shared/errors.js";
import { registerCouponResourceRoutes } from "../../../src/modules/workflow/coupon-resource.routes.js";
import { createCouponResourceJavaClient } from "../../../src/modules/workflow/coupon-resource-java-client.js";

const coupon = { couponId: 11, couponName: "券", couponType: 1, couponContent: "满100减20", stocks: 96, limitNum: 3 };
const page = { success: true, list: [coupon], count: 21, page: 2, pageSize: 10, hasNext: true };
describe("Coupon resources", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it("forces system issuance and passes search/pagination to Java without extra calls", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(page)));
    const result = await createCouponResourceJavaClient().list(272, { couponId: 11, couponName: "券", page: 2, pageSize: 10 });
    expect(result).toEqual({ items: [coupon], total: 21, page: 2, pageSize: 10, hasNext: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ uid: 272, getMode: 2, couponIds: "11", couponName: "券", page: 2, pageSize: 10 });
  });
  it("derives pagination when the live endpoint omits hasNext", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true, list: [coupon], count: 4, page: 1, pageSize: 10,
    })));
    await expect(createCouponResourceJavaClient().list(272, { page: 1, pageSize: 10 }))
      .resolves.toMatchObject({ items: [coupon], total: 4, hasNext: false });
  });
  it("skips coupon records with unsupported types instead of failing the page", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true, list: [{ ...coupon, couponType: 4 }, coupon], count: 2,
    })));
    await expect(createCouponResourceJavaClient().list(272, { page: 1, pageSize: 10 }))
      .resolves.toMatchObject({ items: [coupon], total: 2 });
  });
  it("maps rejection and invalid pages to upstream errors", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (const body of [{ success: false, error: -1, errorMsg: "失败" }, { ...page, list: null }]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
      await expect(createCouponResourceJavaClient().list(272, { page: 2, pageSize: 10 })).rejects.toMatchObject({ statusCode: 502 });
    }
  });
  it("uses authenticated tenant and rejects unauthorized or oversized requests", async () => {
    const app = Fastify(); await registerErrorHandler(app);
    app.decorate("authenticate", async (request: { headers: { authorization?: string }; user?: unknown }) => {
      if (!request.headers.authorization) throw new UnauthorizedError();
      request.user = { uid: 272, subUserId: "1", roles: ["admin"], sessionId: "1", sessionVersion: 1 };
    });
    const list = vi.fn().mockResolvedValue({ items: [coupon], total: 1, page: 1, pageSize: 10, hasNext: false });
    await registerCouponResourceRoutes(app, () => ({ list }));
    expect((await app.inject({ method: "GET", url: "/api/server/workflow/coupons" })).statusCode).toBe(401);
    const response = await app.inject({ method: "GET", url: "/api/server/workflow/coupons?page=1&pageSize=10", headers: { authorization: "Bearer token" } });
    expect(response.statusCode).toBe(200); expect(list).toHaveBeenCalledWith(272, { page: 1, pageSize: 10 });
    expect((await app.inject({ method: "GET", url: "/api/server/workflow/coupons?pageSize=51", headers: { authorization: "Bearer token" } })).statusCode).toBe(400);
    await app.close();
  });
});
