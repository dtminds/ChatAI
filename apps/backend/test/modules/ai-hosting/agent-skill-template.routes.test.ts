import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerAgentSkillTemplateRoutes } from "../../../src/modules/ai-hosting/agent-skill-template.routes.js";

const templateServiceMock = vi.hoisted(() => ({
  getTemplate: vi.fn(),
  listMarketplace: vi.fn(),
}));

vi.mock(
  "../../../src/modules/ai-hosting/agent-skill-template.service.js",
  () => ({
    createAgentSkillTemplateService: () => templateServiceMock,
  }),
);

describe("agent skill template routes", () => {
  let app: ReturnType<typeof Fastify> | undefined;

  beforeEach(async () => {
    templateServiceMock.getTemplate.mockResolvedValue({
      id: "11",
      name: "客户标签查询",
      icon: "",
      description: "标签说明",
      tip: "我适合什么产品？",
      applyScene: "咨询肤质时",
      content: "根据标签推荐",
      recommendResources: [],
    });
    templateServiceMock.listMarketplace.mockResolvedValue({ groups: [] });

    app = Fastify();
    app.decorate("authenticate", async () => undefined);
    app.decorate("db", {});
    await registerAgentSkillTemplateRoutes(app);
  });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  it("loads template detail by id", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/server/ai-hosting/skill-templates/11",
    });

    expect(response.statusCode).toBe(200);
    expect(templateServiceMock.getTemplate).toHaveBeenCalledWith("11");
    expect(response.json()).toMatchObject({
      data: {
        id: "11",
        applyScene: "咨询肤质时",
        content: "根据标签推荐",
      },
      success: true,
    });
  });

  it("rejects non-numeric template ids", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/server/ai-hosting/skill-templates/not-a-number",
    });

    expect(response.statusCode).toBe(400);
    expect(templateServiceMock.getTemplate).not.toHaveBeenCalled();
  });
});
