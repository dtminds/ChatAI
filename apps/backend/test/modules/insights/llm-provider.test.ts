import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAiCompatibleInsightAnalyzer,
  createVolcengineArkProviderConfig,
  maskProviderConfigForLog,
} from "../../../src/modules/insights/llm-provider";
import { InsightsWorkerObservability } from "../../../src/modules/insights/insights-worker-observability";

function createObservabilityHarness() {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  const observability = new InsightsWorkerObservability({
    logger,
    reportedBy: "worker-test:1",
    repository: {
      upsertWorkerPipelineRuntimeState: vi.fn(async () => undefined),
    },
    traceUids: new Set(),
  });

  return { logger, observability };
}

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
                    sentiment: [],
                    summary: {
                      sessionTitle: "咨询",
                      text: "已回复",
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
        const requestBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        requestBodies.push(requestBody);
        const content =
          requestBodies.length === 1
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
                sentiment: {
                  confidence: 0.7,
                  evidenceMessageIds: ["9001"],
                  polarity: "negative",
                  reason: "客户表达不满",
                },
                summary: {
                  sessionTitle: "查物流",
                  text: "客服承诺处理",
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
                      entityCode: "mask",
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
            entityCode: "mask",
            entityName: "补水面膜",
          },
        ],
        intentConfigs: [
          {
            intentCode: "logistics_delay",
            intentName: "物流异常",
            negativeExamples: [],
            positiveExamples: [],
            weight: 1,
          },
        ],
        labelConfigs: [
          {
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

    expect(requestBodies.map((body) => body.model)).toEqual([
      "ep-main",
      "ep-main",
      "ep-lite",
    ]);
    expect(requestBodies.map((body) => body.max_tokens)).toEqual([
      4096, 4096, 1024,
    ]);
    expect(JSON.stringify(requestBodies[0]?.messages)).not.toContain(
      "faqCandidates",
    );
    expect(JSON.stringify(requestBodies[1]?.messages)).toContain("qaFindings");
    expect(JSON.stringify(requestBodies[2]?.messages)).toContain(
      "priorConclusions",
    );
    expect(result).toMatchObject({
      entities: [expect.objectContaining({ entityCode: "mask" })],
      intents: [expect.objectContaining({ intentCode: "logistics_delay" })],
      qaFindings: [
        expect.objectContaining({ ruleCode: "after_sales_followup" }),
      ],
      sentiment: [
        expect.objectContaining({
          evidenceMessageIds: ["9001"],
          polarity: "negative",
          reason: "客户表达不满",
        }),
      ],
      summary: { sessionTitle: "查物流" },
      tags: [expect.objectContaining({ tagCode: "logistics" })],
    });
  });

  it("keeps only one session sentiment when a legacy array response has multiple items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
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
                      evidenceMessageIds: ["9001"],
                      problemDetected: true,
                      problemSummary: "客户反馈物流异常",
                      resolutionStatus: "unresolved",
                    },
                    qaFindings: [],
                    sentiment: [
                      {
                        confidence: 0.7,
                        evidenceMessageIds: ["9001"],
                        polarity: "negative",
                        reason: "客户表达不满",
                      },
                      {
                        confidence: 0.6,
                        evidenceMessageIds: ["9002"],
                        polarity: "neutral",
                        reason: "客服正常回复",
                      },
                    ],
                    summary: {
                      sessionTitle: "查物流",
                      text: "客服承诺处理",
                    },
                    tags: [],
                  }),
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      ),
    );
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      analysisMode: "single",
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 4096,
      model: "ep-main",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });

    const result = await analyzer.analyzeSession({
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
    });

    expect(result.sentiment).toEqual([
      expect.objectContaining({
        evidenceMessageIds: ["9001"],
        polarity: "negative",
        reason: "客户表达不满",
      }),
    ]);
  });

  it("evaluates live analysis gate with lite model and normalized decision output", async () => {
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
                    changeType: "no_material_change",
                    reason: "新增内容仍围绕同一物流问题，风险和处理状态没有明显变化",
                    shouldAnalyze: false,
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
      liteMaxTokens: 512,
      liteModel: "ep-lite",
      maxTokens: 4096,
      model: "ep-main",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });

    const decision = await analyzer.evaluateLiveAnalysisGate({
      context: {
        entityDictionary: [],
        intentConfigs: [],
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
          aiText: "物流还是没动",
          contentStatus: "ready",
          messageType: "text",
          occurredAt: 1,
          senderRole: "customer",
          sourceMessageId: "9002",
        },
      ],
      previousGateSkip: {
        changeType: "no_material_change",
        reason: "上一轮检查没有发现实质变化",
        sourceMessageTo: "9001",
      },
      previousOutput: {
        actionItems: [],
        entities: [],
        faqCandidates: [],
        intents: [
          {
            confidence: 0.82,
            evidenceMessageIds: ["9001"],
            intentCode: "logistics_delay",
            intentLabel: "物流异常",
          },
        ],
        problemResolution: {
          confidence: 0.8,
          evidence: [],
          evidenceMessageIds: ["9001"],
          problemDetected: true,
          problemSummary: "客户反馈物流未更新",
          resolutionStatus: "unresolved",
        },
        qaFindings: [],
        sentiment: [],
        summary: {
          sessionTitle: "物流异常",
          text: "客户反馈物流未更新，客服表示催促。",
        },
        tags: [],
      },
      previousSessionContexts: [],
    });

    expect(decision).toEqual({
      changeType: "no_material_change",
      reason: "新增内容仍围绕同一物流问题，风险和处理状态没有明显变化",
      shouldAnalyze: false,
    });
    expect(requestBody).toMatchObject({
      max_tokens: 512,
      model: "ep-lite",
      response_format: { type: "json_object" },
    });
    expect(JSON.stringify(requestBody?.messages)).toContain("previousOutput");
    expect(JSON.stringify(requestBody?.messages)).toContain("previousGateSkip");
    expect(JSON.stringify(requestBody?.messages)).toContain(
      "上一轮检查没有发现实质变化",
    );
    expect(JSON.stringify(requestBody?.messages)).toContain("物流异常");
  });

  it("treats malformed live gate decisions without explicit true as skipped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    changeType: "risk_escalated",
                    reason: "模型没有返回 shouldAnalyze",
                  }),
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        )
      ),
    );
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      liteMaxTokens: 512,
      liteModel: "ep-lite",
      maxTokens: 4096,
      model: "ep-main",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      responseFormat: "json_object",
    });

    await expect(
      analyzer.evaluateLiveAnalysisGate({
        context: {
          entityDictionary: [],
          intentConfigs: [],
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
            aiText: "物流还是没动",
            contentStatus: "ready",
            messageType: "text",
            occurredAt: 1,
            senderRole: "customer",
            sourceMessageId: "9002",
          },
        ],
        previousSessionContexts: [],
      }),
    ).resolves.toEqual({
      changeType: "no_material_change",
      reason: "模型没有返回 shouldAnalyze",
      shouldAnalyze: false,
    });
  });

  it("skips QA in live analysis while still running classification", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        requestBodies.push(requestBody);
        const content =
          requestBodies.length === 1
            ? {
                actionItems: [
                  {
                    dueHint: "今天",
                    evidenceMessageIds: ["9001"],
                    priority: "high",
                    title: "跟进物流",
                  },
                ],
                faqCandidates: [
                  {
                    answerHint: "查询物流异常处理流程",
                    evidenceMessageIds: ["9001"],
                    question: "物流不更新怎么办",
                    status: "candidate",
                  },
                ],
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
                  sessionTitle: "查物流",
                  text: "客服处理中",
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
    expect(requestBodies.map((body) => body.model)).toEqual([
      "ep-main",
      "ep-lite",
    ]);
    expect(JSON.stringify(requestBodies)).not.toContain("qaFindings");
    const summaryMessages = requestBodies[0]?.messages as Array<{
      content: string;
      role: string;
    }>;
    const summaryPayload = JSON.parse(summaryMessages[1]?.content ?? "{}");
    expect(summaryPayload.outputContract).not.toHaveProperty("actionItems");
    expect(summaryPayload.outputContract).not.toHaveProperty("faqCandidates");
    expect(JSON.stringify(requestBodies[0]?.messages)).not.toContain(
      "actionItems",
    );
    expect(JSON.stringify(requestBodies[0]?.messages)).not.toContain(
      "faqCandidates",
    );
    expect(result.actionItems).toEqual([
      expect.objectContaining({ title: "跟进物流" }),
    ]);
    expect(result.faqCandidates).toEqual([]);
    expect(result.qaFindings).toEqual([]);
    expect(result.intents).toEqual([
      expect.objectContaining({ intentCode: "logistics_delay" }),
    ]);
  });

  it("does not ask for follow-up outputs during manual all reanalysis", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        requestBodies.push(requestBody);
        const content =
          requestBodies.length === 1
            ? {
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
                  sessionTitle: "查物流",
                  text: "客服处理中",
                },
              }
            : requestBodies.length === 2
              ? { qaFindings: [] }
              : { entities: [], intents: [], tags: [] };

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

    await analyzer.analyzeSession({
      context: {
        entityDictionary: [],
        intentConfigs: [],
        labelConfigs: [],
        qaRuleConfigs: [],
      },
      job: {
        analysisScope: "all",
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

    expect(requestBodies).toHaveLength(3);
    const summaryMessages = requestBodies[0]?.messages as Array<{
      content: string;
      role: string;
    }>;
    const summaryPayload = JSON.parse(summaryMessages[1]?.content ?? "{}");
    expect(summaryPayload.outputContract).not.toHaveProperty("actionItems");
    expect(summaryPayload.outputContract).not.toHaveProperty("faqCandidates");
    expect(JSON.stringify(requestBodies[0]?.messages)).not.toContain(
      "actionItems",
    );
    expect(JSON.stringify(requestBodies[0]?.messages)).not.toContain(
      "faqCandidates",
    );
  });

  it("does not ask for follow-up outputs during scoped final analysis", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        requestBodies.push(requestBody);

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    qaFindings: [],
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

    await analyzer.analyzeSession({
      context: {
        entityDictionary: [],
        intentConfigs: [],
        labelConfigs: [],
        qaRuleConfigs: [
          {
            applicableScene: "售后",
            description: "",
            judgmentCriteria: "必须说明处理动作",
            negativeExamples: [],
            positiveExamples: [],
            ruleCode: "after_sales_followup",
            ruleName: "售后跟进",
            severity: "high",
          },
        ],
      },
      job: {
        analysisScope: "qaFindings",
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

    expect(requestBodies).toHaveLength(1);
    expect(JSON.stringify(requestBodies[0]?.messages)).not.toContain(
      "actionItems",
    );
    expect(JSON.stringify(requestBodies[0]?.messages)).not.toContain(
      "faqCandidates",
    );
  });

  it("runs only classification for classification scoped reanalysis", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
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
                        entityCode: "mask",
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
    expect(JSON.stringify(requestBodies[0]?.messages)).toContain(
      "tags, entities, intents",
    );
    expect(result).toMatchObject({
      entities: [expect.objectContaining({ entityCode: "mask" })],
      intents: [],
      qaFindings: [],
      tags: [expect.objectContaining({ tagCode: "logistics" })],
    });
    expect(result.summary.sessionTitle).toBe("");
    expect(result.summary.text).toBe("");
  });

  it("retries retryable optional classification failures before degrading the dimension", async () => {
    vi.useFakeTimers();
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
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
                        sessionTitle: "查物流",
                        text: "客服处理中",
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
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { observability } = createObservabilityHarness();
    const recoverSpy = vi.spyOn(observability, "recover");
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
    }, observability);

    const resultPromise = analyzer.analyzeSession({
      context: {
        entityDictionary: [],
        intentConfigs: [
          {
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
    expect(requestBodies.map((body) => body.model)).toEqual([
      "ep-main",
      "ep-lite",
      "ep-lite",
    ]);
    expect(recoverSpy).toHaveBeenCalledWith(
      "provider_optional_step",
      "analysis",
      9001,
    );
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
                  sentiment: [],
                  summary: {
                    sessionTitle: "寒暄",
                    text: "无明确问题",
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
      summary: { sessionTitle: "寒暄" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("reports each real request and retry without logging provider response text", async () => {
    vi.useFakeTimers();
    const providerBody = "rate limited customer-content-marker";
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(providerBody, { status: 429 });
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
                  sentiment: [],
                  summary: {
                    sessionTitle: "寒暄",
                    text: "无明确问题",
                  },
                  tags: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { logger, observability } = createObservabilityHarness();
    const analyzer = new OpenAiCompatibleInsightAnalyzer({
      analysisMode: "single",
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      maxTokens: 4096,
      model: "ep-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
      retry: {
        baseDelayMs: 100,
        maxAttempts: 2,
      },
    }, observability);

    const resultPromise = analyzer.analyzeSession({
      job: {
        analysisScope: "all",
        attemptCount: 0,
        jobId: "job-1",
        maxAttempts: 2,
        mode: "final",
        sessionId: "501",
        uid: 9001,
      },
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

    await vi.advanceTimersByTimeAsync(100);
    await expect(resultPromise).resolves.toMatchObject({
      summary: { sessionTitle: "寒暄" },
    });

    const requestEvents = logger.debug.mock.calls.filter(
      ([payload]) => payload.eventCode === "insights_worker.llm_request_completed",
    );
    expect(requestEvents).toHaveLength(2);
    expect(requestEvents[0]?.[0]).toMatchObject({
      errorCode: "LLM_REQUEST_FAILED",
      httpStatus: 429,
      outcome: "failed",
      step: "single",
      uid: 9001,
    });
    expect(requestEvents[1]?.[0]).toMatchObject({
      httpStatus: 200,
      outcome: "succeeded",
      step: "single",
      uid: 9001,
    });
    expect(JSON.stringify(requestEvents)).not.toContain(providerBody);

    await observability.stop();
    const summary = logger.info.mock.calls.find(
      ([payload]) => payload.eventCode === "insights_worker.pipeline_summary"
        && payload.pipeline === "analysis",
    )?.[0];
    expect(summary).toMatchObject({
      modelFailures: 1,
      modelRequests: 2,
      modelRetries: 1,
    });
    vi.useRealTimers();
  });

  it("falls back without JSON response format when the model does not support it", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const { logger, observability } = createObservabilityHarness();
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        requestBodies.push(JSON.parse(String(init?.body)));

        if (fetchMock.mock.calls.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                code: "InvalidParameter",
                message:
                  "The parameter `response_format.type` specified in the request are not valid: `json_object` is not supported by this model.",
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
                    sentiment: [],
                    summary: {
                      sessionTitle: "寒暄",
                      text: "无明确问题",
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
      },
    );
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
    }, observability);

    await expect(
      analyzer.analyzeSession({
        job: {
          analysisScope: "all",
          attemptCount: 0,
          jobId: "job-1",
          maxAttempts: 2,
          mode: "final",
          sessionId: "501",
          uid: 9001,
        },
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
      summary: { sessionTitle: "寒暄" },
    });

    expect(requestBodies[0]).toHaveProperty("response_format");
    expect(requestBodies[1]).not.toHaveProperty("response_format");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "insights_worker.llm_response_format_fallback",
        uid: 9001,
      }),
      expect.any(String),
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "insights_worker.error_recovered" }),
      expect.any(String),
    );
    await observability.stop();
  });

  it("times out stalled LLM requests", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
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

    const expectation = expect(resultPromise).rejects.toThrow(
      "LLM request timed out after 2000ms",
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await expectation;
    vi.useRealTimers();
  });

  it("reports model timeouts with a stable error code", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            });
          }),
      ),
    );
    const { logger, observability } = createObservabilityHarness();
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
    }, observability);

    const resultPromise = analyzer.analyzeSession({
      job: {
        analysisScope: "all",
        attemptCount: 0,
        jobId: "job-1",
        maxAttempts: 2,
        mode: "final",
        sessionId: "501",
        uid: 9001,
      },
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
    const expectation = expect(resultPromise).rejects.toThrow(
      "LLM request timed out after 2000ms",
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await expectation;

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "LLM_TIMEOUT",
        errorName: "LlmTimeoutError",
        eventCode: "insights_worker.llm_request_completed",
        failedStep: "single",
        timeoutMs: 2_000,
      }),
      expect.any(String),
    );
    await observability.stop();
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
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
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
                    sentiment: [],
                    summary: {
                      sessionTitle: "寒暄",
                      text: "客服已回复",
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
      vi.fn(
        async () =>
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
                        sentiment: [],
                        summary: {
                          sessionTitle: "查物流",
                          text: "客服承诺处理",
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
