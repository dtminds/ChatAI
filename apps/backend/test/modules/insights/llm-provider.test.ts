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
      VOLCENGINE_ARK_LITE_MAX_TOKENS: "1024",
      VOLCENGINE_ARK_LITE_MODEL: "ep-20260601000000-lite",
      VOLCENGINE_ARK_MODEL: "ep-20260601000000-test",
    });

    expect(config).toEqual({
      analysisMode: "multi_step",
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      liteMaxTokens: 1024,
      liteModel: "ep-20260601000000-lite",
      maxTokens: 2048,
      model: "ep-20260601000000-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      requestTimeoutMs: 60_000,
      responseFormat: "json_object",
    });
  });

  it("uses the main model as the lite fallback when lite env is not configured", () => {
    const config = createVolcengineArkProviderConfig({
      VOLCENGINE_ARK_API_KEY: "secret",
      VOLCENGINE_ARK_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
      VOLCENGINE_ARK_MAX_TOKENS: "2048",
      VOLCENGINE_ARK_MODEL: "ep-main",
    });

    expect(config).toMatchObject({
      liteMaxTokens: 2048,
      liteModel: "ep-main",
      maxTokens: 2048,
      model: "ep-main",
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
      analysisMode: "single",
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

  it("runs final analysis as summary, QA and classification calls using main and lite models", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestBodies.push(requestBody);
        const content = requestBodies.length === 1
          ? {
              actionItems: [],
              faqCandidates: [],
              problemResolution: {
                confidence: 0.82,
                evidence: [],
                evidenceMessageIds: ["9001"],
                problemDetected: true,
                problemSummary: "客户反馈物流异常",
                resolutionStatus: "unresolved",
              },
              sentiment: [
                {
                  confidence: 0.7,
                  evidenceMessageIds: ["9001"],
                  polarity: "negative",
                  reason: "客户表达不满",
                },
              ],
              summary: {
                confidence: 0.88,
                customerIntent: "查物流",
                processSummary: "客服承诺处理",
                resultSummary: "尚未解决",
              },
            }
          : requestBodies.length === 2
            ? {
                qaFindings: [
                  {
                    confidence: 0.9,
                    evidenceMessageIds: ["9002"],
                    passed: true,
                    reason: "客服给出处理动作",
                    ruleCode: "after_sales_followup",
                    severity: "high",
                  },
                ],
              }
            : {
                entities: [
                  {
                    confidence: 0.8,
                    entityId: "mask",
                    entityName: "补水面膜",
                    entityType: "product",
                    evidenceMessageIds: ["9001"],
                  },
                ],
                intents: [
                  {
                    confidence: 0.84,
                    evidenceMessageIds: ["9001"],
                    intentCode: "logistics_delay",
                    intentLabel: "物流异常",
                  },
                ],
                tags: [
                  {
                    confidence: 0.86,
                    evidenceMessageIds: ["9001"],
                    tagCode: "logistics",
                    tagName: "物流咨询",
                  },
                ],
              };

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(content) } }],
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }),
    );
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      liteMaxTokens: 1024,
      liteModel: "ep-lite",
      maxTokens: 4096,
      model: "ep-main",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });

    const result = await analyzer.analyzeSession({
      context: {
        entityDictionary: [
          {
            aliases: ["mask"],
            canonicalName: "补水面膜",
            entityType: "product",
            includeInAggregation: true,
          },
        ],
        intentConfigs: [
          {
            aliases: ["查快递"],
            includeInStatistics: true,
            intentCode: "logistics_delay",
            intentName: "物流异常",
            negativeExamples: [],
            positiveExamples: [],
            weight: 1,
          },
        ],
        labelConfigs: [
          {
            includeInStatistics: true,
            labelCode: "logistics",
            labelName: "物流咨询",
            negativeExamples: [],
            positiveExamples: [],
          },
        ],
        qaRuleConfigs: [
          {
            negativeExamples: [],
            positiveExamples: [],
            ruleCode: "after_sales_followup",
            ruleName: "售后跟进",
            severity: "high",
          },
        ],
      },
      job: {
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "final",
        sessionId: "501",
        uid: 9001,
      },
      messages: [
        {
          aiText: "快递一直没更新",
          contentStatus: "ready",
          messageType: "text",
          occurredAt: 1,
          senderRole: "customer",
          sourceMessageId: "9001",
        },
      ],
      previousSessionContexts: [],
    });

    expect(requestBodies.map((body) => body.model)).toEqual(["ep-main", "ep-main", "ep-lite"]);
    expect(requestBodies.map((body) => body.max_tokens)).toEqual([4096, 4096, 1024]);
    expect(JSON.stringify(requestBodies[1]?.messages)).toContain("qaFindings");
    expect(JSON.stringify(requestBodies[2]?.messages)).toContain("priorConclusions");
    expect(result).toMatchObject({
      entities: [expect.objectContaining({ entityName: "补水面膜" })],
      intents: [expect.objectContaining({ intentCode: "logistics_delay" })],
      qaFindings: [expect.objectContaining({ ruleCode: "after_sales_followup" })],
      summary: { customerIntent: "查物流" },
      tags: [expect.objectContaining({ tagCode: "logistics" })],
    });
  });

  it("skips QA in live analysis while still running classification", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestBodies.push(requestBody);
        const content = requestBodies.length === 1
          ? {
              actionItems: [],
              faqCandidates: [],
              problemResolution: {
                confidence: 0.8,
                evidence: [],
                evidenceMessageIds: ["9001"],
                problemDetected: true,
                problemSummary: "客户反馈物流异常",
                resolutionStatus: "unknown",
              },
              sentiment: [],
              summary: {
                confidence: 0.8,
                customerIntent: "查物流",
                processSummary: "客服处理中",
                resultSummary: "待确认",
              },
            }
          : {
              entities: [],
              intents: [
                {
                  confidence: 0.8,
                  evidenceMessageIds: ["9001"],
                  intentCode: "logistics_delay",
                  intentLabel: "物流异常",
                },
              ],
              tags: [],
            };

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(content) } }],
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }),
    );
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      liteMaxTokens: 1024,
      liteModel: "ep-lite",
      maxTokens: 4096,
      model: "ep-main",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });

    const result = await analyzer.analyzeSession({
      context: {
        entityDictionary: [],
        intentConfigs: [
          {
            aliases: ["查快递"],
            includeInStatistics: true,
            intentCode: "logistics_delay",
            intentName: "物流异常",
            negativeExamples: [],
            positiveExamples: [],
            weight: 1,
          },
        ],
        labelConfigs: [],
        qaRuleConfigs: [
          {
            negativeExamples: [],
            positiveExamples: [],
            ruleCode: "after_sales_followup",
            ruleName: "售后跟进",
            severity: "high",
          },
        ],
      },
      job: {
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "live",
        sessionId: "501",
        uid: 9001,
      },
      messages: [
        {
          aiText: "快递一直没更新",
          contentStatus: "ready",
          messageType: "text",
          occurredAt: 1,
          senderRole: "customer",
          sourceMessageId: "9001",
        },
      ],
      previousSessionContexts: [],
    });

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies.map((body) => body.model)).toEqual(["ep-main", "ep-lite"]);
    expect(JSON.stringify(requestBodies)).not.toContain("qaFindings");
    expect(result.qaFindings).toEqual([]);
    expect(result.intents).toEqual([
      expect.objectContaining({ intentCode: "logistics_delay" }),
    ]);
  });

  it("runs only classification for classification scoped reanalysis", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestBodies.push(requestBody);

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    entities: [
                      {
                        confidence: 0.8,
                        entityId: "mask",
                        entityName: "补水面膜",
                        entityType: "product",
                        evidenceMessageIds: ["9001"],
                      },
                    ],
                    intents: [],
                    tags: [
                      {
                        confidence: 0.86,
                        evidenceMessageIds: ["9001"],
                        tagCode: "logistics",
                        tagName: "物流咨询",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }),
    );
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      liteMaxTokens: 1024,
      liteModel: "ep-lite",
      maxTokens: 4096,
      model: "ep-main",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });

    const result = await analyzer.analyzeSession({
      context: {
        entityDictionary: [],
        intentConfigs: [],
        labelConfigs: [],
        qaRuleConfigs: [],
      },
      job: {
        analysisScope: "classification",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "manual_reanalyze",
        sessionId: "501",
        uid: 9001,
      },
      messages: [
        {
          aiText: "快递一直没更新",
          contentStatus: "ready",
          messageType: "text",
          occurredAt: 1,
          senderRole: "customer",
          sourceMessageId: "9001",
        },
      ],
      previousSessionContexts: [],
    });

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]?.model).toBe("ep-lite");
    expect(JSON.stringify(requestBodies[0]?.messages)).toContain("tags, entities, intents");
    expect(result).toMatchObject({
      entities: [expect.objectContaining({ entityName: "补水面膜" })],
      intents: [],
      qaFindings: [],
      tags: [expect.objectContaining({ tagCode: "logistics" })],
    });
    expect(result.summary.customerIntent).toBe("");
  });

  it("retries retryable optional classification failures before degrading the dimension", async () => {
    vi.useFakeTimers();
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(requestBody);

      if (requestBodies.length === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    actionItems: [],
                    faqCandidates: [],
                    problemResolution: {
                      confidence: 0.8,
                      evidence: [],
                      evidenceMessageIds: ["9001"],
                      problemDetected: true,
                      problemSummary: "客户反馈物流异常",
                      resolutionStatus: "unknown",
                    },
                    sentiment: [],
                    summary: {
                      confidence: 0.8,
                      customerIntent: "查物流",
                      processSummary: "客服处理中",
                      resultSummary: "待确认",
                    },
                  }),
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }

      if (requestBodies.length === 2) {
        return new Response("rate limited", { status: 429 });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  entities: [],
                  intents: [
                    {
                      confidence: 0.8,
                      evidenceMessageIds: ["9001"],
                      intentCode: "logistics_delay",
                      intentLabel: "物流异常",
                    },
                  ],
                  tags: [],
                }),
              },
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      liteMaxTokens: 1024,
      liteModel: "ep-lite",
      maxTokens: 4096,
      model: "ep-main",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
      retry: {
        baseDelayMs: 100,
        maxAttempts: 2,
      },
    });

    const resultPromise = analyzer.analyzeSession({
      context: {
        entityDictionary: [],
        intentConfigs: [
          {
            aliases: ["查快递"],
            includeInStatistics: true,
            intentCode: "logistics_delay",
            intentName: "物流异常",
            negativeExamples: [],
            positiveExamples: [],
            weight: 1,
          },
        ],
        labelConfigs: [],
        qaRuleConfigs: [],
      },
      job: {
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "live",
        sessionId: "501",
        uid: 9001,
      },
      messages: [
        {
          aiText: "快递一直没更新",
          contentStatus: "ready",
          messageType: "text",
          occurredAt: 1,
          senderRole: "customer",
          sourceMessageId: "9001",
        },
      ],
      previousSessionContexts: [],
    });

    await vi.advanceTimersByTimeAsync(100);
    await expect(resultPromise).resolves.toMatchObject({
      analysisWarnings: [],
      intents: [expect.objectContaining({ intentCode: "logistics_delay" })],
    });
    expect(requestBodies.map((body) => body.model)).toEqual(["ep-main", "ep-lite", "ep-lite"]);
    vi.useRealTimers();
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
      analysisMode: "single",
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

  it("falls back without JSON response format when the model does not support it", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)));

      if (fetchMock.mock.calls.length === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: "InvalidParameter",
              message: "The parameter `response_format.type` specified in the request are not valid: `json_object` is not supported by this model.",
              param: "response_format.type",
              type: "BadRequest",
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 400,
          },
        );
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
      analysisMode: "single",
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
            aiText: "你好",
            contentStatus: "ready",
            messageType: "text",
            occurredAt: 1,
            senderRole: "customer",
            sourceMessageId: "1",
          },
        ],
      }),
    ).resolves.toMatchObject({
      summary: { customerIntent: "寒暄" },
    });

    expect(requestBodies[0]).toHaveProperty("response_format");
    expect(requestBodies[1]).not.toHaveProperty("response_format");
  });

  it("times out stalled LLM requests", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
      ),
    );
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      analysisMode: "single",
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 4096,
      model: "ep-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      requestTimeoutMs: 2_000,
      retry: {
        baseDelayMs: 1_000,
        maxAttempts: 1,
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

    const expectation = expect(resultPromise).rejects.toThrow("LLM request timed out after 2000ms");

    await vi.advanceTimersByTimeAsync(2_000);
    await expectation;
    vi.useRealTimers();
  });

  it("retries timed out LLM requests", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        calls += 1;

        if (calls === 1) {
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          });
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
                      processSummary: "客服已回复",
                      resultSummary: "无需处理",
                    },
                    tags: [],
                  }),
                },
              },
            ],
          }),
        );
      }),
    );
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      analysisMode: "single",
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 4096,
      model: "ep-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      requestTimeoutMs: 2_000,
      retry: {
        baseDelayMs: 100,
        maxAttempts: 2,
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

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(100);
    await expect(resultPromise).resolves.toMatchObject({
      problemResolution: {
        resolutionStatus: "no_customer_problem",
      },
    });
    expect(calls).toBe(2);
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
      analysisMode: "single",
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
