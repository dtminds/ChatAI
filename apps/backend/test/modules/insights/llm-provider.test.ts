import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAiCompatibleInsightAnalyzer,
  createVolcengineArkProviderConfig,
  maskProviderConfigForLog,
} from "../../../src/modules/insights/llm-provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LLM provider config", () => {
  it("resolves Volcengine Ark as an OpenAI-compatible provider", () => {
    const config = createVolcengineArkProviderConfig({
      VOLCENGINE_ARK_API_KEY: "secret",
      VOLCENGINE_ARK_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
      VOLCENGINE_ARK_MAX_TOKENS: "2048",
      VOLCENGINE_ARK_MODEL: "ep-20260601000000-test",
    });

    expect(config).toEqual({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 2048,
      model: "ep-20260601000000-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });
  });

  it("validates required Volcengine Ark env values", () => {
    expect(() => createVolcengineArkProviderConfig({})).toThrow(
      "VOLCENGINE_ARK_API_KEY, VOLCENGINE_ARK_BASE_URL, VOLCENGINE_ARK_MODEL",
    );
    expect(() =>
      createVolcengineArkProviderConfig({
        VOLCENGINE_ARK_API_KEY: "secret",
        VOLCENGINE_ARK_BASE_URL: "not-a-url",
        VOLCENGINE_ARK_MODEL: "ep-test",
      }),
    ).toThrow("VOLCENGINE_ARK_BASE_URL must be an HTTPS URL");
  });

  it("masks provider secrets for diagnostics", () => {
    expect(
      maskProviderConfigForLog({
        apiKey: "secret",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        maxTokens: 4096,
        model: "ep-test",
        providerCode: "volcengine_ark",
        protocol: "openai-compatible",
        responseFormat: "json_object",
      }),
    ).toEqual({
      apiKey: "[redacted]",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 4096,
      model: "ep-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });
  });

  it("sends JSON response format and max tokens by default", async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    actionItems: [],
                    entities: [],
                    faqCandidates: [],
                    intents: [],
                    problemResolution: {
                      confidence: 0.8,
                      evidence: [
                        {
                          evidenceRole: "customer_problem",
                          messageId: "1",
                          reason: "客户提出咨询问题",
                        },
                      ],
                      evidenceMessageIds: ["1"],
                      problemDetected: false,
                      problemSummary: "",
                      resolutionStatus: "resolved",
                    },
                    qaFindings: [],
                    risks: [],
                    sentiment: [],
                    summary: {
                      confidence: 0.8,
                      customerIntent: "咨询",
                      processSummary: "已回复",
                      resultSummary: "已解决",
                    },
                    tags: [],
                  }),
                },
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }),
    );

    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 4096,
      model: "ep-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });

    await analyzer.analyzeSession({
      messages: [
        {
          aiText: "你好",
          contentStatus: "ready",
          messageType: "text",
          occurredAt: 1,
          senderRole: "customer",
          sourceMessageId: "1",
        },
      ],
    });

    expect(requestBody).toBeDefined();
    expect(requestBody).toMatchObject({
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
  });

  it("retries retryable LLM failures with exponential backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length < 3) {
        return new Response("rate limited", { status: 429 });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  actionItems: [],
                  entities: [],
                  faqCandidates: [],
                  intents: [],
                  problemResolution: {
                    confidence: 0.8,
                    evidence: [],
                    evidenceMessageIds: [],
                    problemDetected: false,
                    problemSummary: "",
                    resolutionStatus: "no_customer_problem",
                  },
                  qaFindings: [],
                  risks: [],
                  sentiment: [],
                  summary: {
                    confidence: 0.8,
                    customerIntent: "寒暄",
                    processSummary: "无明确问题",
                    resultSummary: "无需处理",
                  },
                  tags: [],
                }),
              },
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 4096,
      model: "ep-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
      retry: {
        baseDelayMs: 1_000,
        maxAttempts: 3,
      },
    });

    const resultPromise = analyzer.analyzeSession({
      messages: [
        {
          aiText: "你好",
          contentStatus: "ready",
          messageType: "text",
          occurredAt: 1,
          senderRole: "customer",
          sourceMessageId: "1",
        },
      ],
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(resultPromise).resolves.toMatchObject({
      summary: { customerIntent: "寒暄" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("parses JSON object even when the model wraps it in a markdown fence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    "```json",
                    JSON.stringify({
                      actionItems: [],
                      entities: [],
                      faqCandidates: [],
                      intents: [],
                      problemResolution: {
                        confidence: 0.8,
                        evidence: [
                          {
                            evidenceRole: "customer_problem",
                            messageId: "1",
                            reason: "客户反馈物流异常",
                          },
                          {
                            evidenceRole: "random_role",
                            messageId: "2",
                            reason: "模型返回了非法证据角色",
                          },
                        ],
                        evidenceMessageIds: ["1", "2"],
                        problemDetected: true,
                        problemSummary: "客户反馈物流异常",
                        resolutionStatus: "unresolved",
                      },
                      qaFindings: [],
                      risks: [],
                      sentiment: [],
                      summary: {
                        confidence: 0.8,
                        customerIntent: "查物流",
                        processSummary: "客服承诺处理",
                        resultSummary: "尚未解决",
                      },
                      tags: [],
                    }),
                    "```",
                  ].join("\n"),
                },
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      ),
    );

    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 4096,
      model: "ep-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });

    await expect(
      analyzer.analyzeSession({
        messages: [
          {
            aiText: "快递一直没更新",
            contentStatus: "ready",
            messageType: "text",
            occurredAt: 1,
            senderRole: "customer",
            sourceMessageId: "1",
          },
        ],
      }),
    ).resolves.toMatchObject({
      problemResolution: {
        evidence: [
          expect.objectContaining({
            evidenceRole: "customer_problem",
            messageId: "1",
          }),
          expect.objectContaining({
            evidenceRole: "primary",
            messageId: "2",
          }),
        ],
        resolutionStatus: "unresolved",
      },
    });
  });
});
