import { Suspense, lazy, useEffect, type ReactNode } from "react";
import {
  Navigate,
  createBrowserRouter,
  useLocation,
  useRouteError,
} from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { EmbedRootLayout } from "@/app/embed-root-layout";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { InsightsCapabilitiesRoute } from "@/pages/chat/insights/insights-capabilities-context";
import { isPagePathAllowedForHostname } from "@/lib/host-page-access";
import { isEmbedPath } from "@/pages/auth/auth-redirect";

const LoginPage = lazy(() =>
  import("@/pages/auth/login-page").then(({ LoginPage }) => ({
    default: LoginPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/not-found-page").then(({ NotFoundPage }) => ({
    default: NotFoundPage,
  })),
);
const WorkflowDirectEntryPage = lazy(() =>
  import("@/pages/workflow-direct-entry-page").then(({ WorkflowDirectEntryPage }) => ({
    default: WorkflowDirectEntryPage,
  })),
);
const ChatWorkbenchRoutePage = lazy(() =>
  import("@/pages/chat/chat-workbench-page").then(({ ChatWorkbenchRoutePage }) => ({
    default: ChatWorkbenchRoutePage,
  })),
);
const ChatSettingsPage = lazy(() =>
  import("@/pages/chat/settings/chat-settings-page").then(({ ChatSettingsPage }) => ({
    default: ChatSettingsPage,
  })),
);
const AgentManagementPage = lazy(() =>
  import("@/pages/chat/ai-hosting/agent-management-page").then(
    ({ AgentManagementPage }) => ({
      default: AgentManagementPage,
    }),
  ),
);
const AgentHostingSettingsPage = lazy(() =>
  import("@/pages/chat/ai-hosting/agent-hosting-settings-page").then(
    ({ AgentHostingSettingsPage }) => ({
      default: AgentHostingSettingsPage,
    }),
  ),
);
const WorkflowPage = lazy(() =>
  import("@/pages/chat/workflow/workflow-list-page").then(
    ({ WorkflowPage }) => ({
      default: WorkflowPage,
    }),
  ),
);
const WorkflowObservabilityPage = lazy(() =>
  import("@/pages/chat/workflow/workflow-observability-page").then(
    ({ WorkflowObservabilityPage }) => ({
      default: WorkflowObservabilityPage,
    }),
  ),
);
const WorkflowEditorPage = lazy(() =>
  import("@/pages/chat/workflow/workflow-editor-page").then(
    ({ WorkflowEditorPage }) => ({
      default: WorkflowEditorPage,
    }),
  ),
);
const AgentSubscriptionPage = lazy(() =>
  import("@/pages/chat/ai-hosting/agent-subscription-page").then(
    ({ AgentSubscriptionPage }) => ({
      default: AgentSubscriptionPage,
    }),
  ),
);
const AiSkillsPage = lazy(() =>
  import("@/pages/chat/ai-hosting/ai-skills-page").then(({ AiSkillsPage }) => ({
    default: AiSkillsPage,
  })),
);
const AiSkillSettingsPage = lazy(() =>
  import("@/pages/chat/ai-hosting/ai-skill-settings-page").then(
    ({ AiSkillSettingsPage }) => ({
      default: AiSkillSettingsPage,
    }),
  ),
);
const UserMemoryPage = lazy(() =>
  import("@/pages/chat/ai-hosting/user-memory-page").then(
    ({ UserMemoryPage }) => ({ default: UserMemoryPage }),
  ),
);
const AgentSettingsPage = lazy(() =>
  import("@/pages/chat/ai-hosting/agent-settings-page").then(({ AgentSettingsPage }) => ({
    default: AgentSettingsPage,
  })),
);
const AgentOptimizationSuggestionsPage = lazy(() =>
  import("@/pages/chat/ai-hosting/agent-optimization-suggestions-page").then(
    ({ AgentOptimizationSuggestionsPage }) => ({
      default: AgentOptimizationSuggestionsPage,
    }),
  ),
);
const KbListPage = lazy(() =>
  import("@/pages/chat/ai-hosting/kb-list-page").then(
    ({ KbListPage }) => ({
      default: KbListPage,
    }),
  ),
);
const KbDetailPage = lazy(() =>
  import("@/pages/chat/ai-hosting/kb-detail-page").then(
    ({ KbDetailPage }) => ({
      default: KbDetailPage,
    }),
  ),
);
const KbDocDetailPage = lazy(() =>
  import("@/pages/chat/ai-hosting/kb-doc-detail-page").then(
    ({ KbDocDetailPage }) => ({
      default: KbDocDetailPage,
    }),
  ),
);
const InsightsOverviewPage = lazy(() =>
  import("@/pages/chat/insights/insights-overview-page").then(
    ({ InsightsOverviewPage }) => ({
      default: InsightsOverviewPage,
    }),
  ),
);
const InsightsQualityPage = lazy(() =>
  import("@/pages/chat/insights/insights-quality-page").then(
    ({ InsightsQualityPage }) => ({
      default: InsightsQualityPage,
    }),
  ),
);
const InsightsBusinessPage = lazy(() =>
  import("@/pages/chat/insights/insights-business-page").then(
    ({ InsightsBusinessPage }) => ({
      default: InsightsBusinessPage,
    }),
  ),
);
const InsightsSettingsPage = lazy(() =>
  import("@/pages/chat/insights/insights-settings-page").then(
    ({ InsightsSettingsPage }) => ({
      default: InsightsSettingsPage,
    }),
  ),
);
const InsightsWorkerObservabilityPage = lazy(() =>
  import("@/pages/chat/insights/insights-worker-observability-page").then(
    ({ InsightsWorkerObservabilityPage }) => ({
      default: InsightsWorkerObservabilityPage,
    }),
  ),
);

function withRouteSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

function RouteErrorFallback() {
  const error = useRouteError();

  useEffect(() => {
    console.error("Route error captured:", error);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <div
        aria-label="页面加载失败"
        className="max-w-sm text-center"
        role="alert"
      >
        <h1 className="text-base font-medium text-foreground">页面加载失败</h1>
        <p className="mt-2 text-sm text-muted-foreground">请刷新页面后重试</p>
        <Button
          className="mt-4"
          onClick={() => {
            window.location.reload();
          }}
          type="button"
        >
          刷新页面
        </Button>
      </div>
    </main>
  );
}

function RouteLoadingFallback() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background text-foreground">
      <div className="inline-flex items-center gap-3 text-sm text-muted-foreground">
        <DotMatrixLoader
          ariaLabel="正在加载页面"
          className="text-muted-foreground"
          dotSize={3}
          size={22}
        />
        <span>正在加载页面</span>
      </div>
    </main>
  );
}

function HostRestrictedRoot() {
  const location = useLocation();
  const hostname = typeof window === "undefined" ? "localhost" : window.location.hostname;

  if (!isPagePathAllowedForHostname(hostname, location.pathname)) {
    return withRouteSuspense(<NotFoundPage showHomeLink={false} />);
  }

  return isEmbedPath(location.pathname) ? <EmbedRootLayout /> : <RootLayout />;
}

export const routerConfig = [
  {
    path: "/",
    element: <HostRestrictedRoot />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/chat" />,
      },
      {
        path: "login",
        element: withRouteSuspense(<LoginPage />),
      },
      {
        path: "workflow/endpoint",
        element: withRouteSuspense(<WorkflowDirectEntryPage />),
      },
      {
        path: "chat",
        element: withRouteSuspense(<ChatWorkbenchRoutePage />),
        children: [
          {
            element: <></>,
            path: "conversations/:conversationId",
          },
          {
            element: <></>,
            path: "customers",
          },
          {
            element: <></>,
            path: "tickets",
          },
          {
            element: <></>,
            path: "tickets/:ticketId",
          },
        ],
      },
      {
        path: "chat/settings",
        element: withRouteSuspense(<ChatSettingsPage />),
      },
      {
        path: "chat/settings/:sectionId",
        element: withRouteSuspense(<ChatSettingsPage />),
      },
      {
        path: "chat/insights",
        element: <InsightsCapabilitiesRoute />,
        children: [
          {
            index: true,
            element: withRouteSuspense(<InsightsOverviewPage />),
          },
          {
            path: "quality",
            element: withRouteSuspense(<InsightsQualityPage />),
          },
          {
            path: "business",
            element: withRouteSuspense(<InsightsBusinessPage />),
          },
          {
            path: "records",
            element: <Navigate replace to="/chat/insights" />,
          },
          {
            path: "settings",
            element: withRouteSuspense(<InsightsSettingsPage />),
          },
          {
            path: "worker-observability",
            element: withRouteSuspense(<InsightsWorkerObservabilityPage />),
          },
        ],
      },
      {
        path: "chat/ai-hosting",
        element: <Navigate replace to="/chat/ai-hosting/agents" />,
      },
      {
        path: "chat/ai-hosting/agents",
        element: withRouteSuspense(<AgentManagementPage />),
      },
      {
        path: "chat/workflows",
        element: withRouteSuspense(<WorkflowPage surface="chatai" />),
      },
      {
        path: "chat/workflows/new",
        element: withRouteSuspense(<WorkflowEditorPage surface="chatai" />),
      },
      {
        path: "chat/workflows/observability",
        element: withRouteSuspense(<WorkflowObservabilityPage />),
      },
      {
        path: "chat/workflows/:workflowId",
        element: withRouteSuspense(<WorkflowEditorPage surface="chatai" />),
      },
      {
        path: "chat/workflows/:workflowId/data",
        element: withRouteSuspense(<WorkflowEditorPage surface="chatai" />),
      },
      {
        path: "embed/workflows",
        element: withRouteSuspense(<WorkflowPage surface="sop_embed" />),
      },
      {
        path: "embed/workflows/new",
        element: withRouteSuspense(<WorkflowEditorPage surface="sop_embed" />),
      },
      {
        path: "embed/workflows/:workflowId",
        element: withRouteSuspense(<WorkflowEditorPage surface="sop_embed" />),
      },
      {
        path: "embed/workflows/:workflowId/data",
        element: withRouteSuspense(<WorkflowEditorPage surface="sop_embed" />),
      },
      {
        path: "chat/ai-hosting/agents/new",
        element: withRouteSuspense(<AgentSettingsPage />),
      },
      {
        path: "chat/ai-hosting/agents/:agentId/optimization-suggestions",
        element: withRouteSuspense(<AgentOptimizationSuggestionsPage />),
      },
      {
        path: "chat/ai-hosting/agents/:agentId",
        element: withRouteSuspense(<AgentSettingsPage />),
      },
      {
        path: "chat/ai-hosting/kb",
        element: withRouteSuspense(<KbListPage />),
      },
      {
        path: "chat/ai-hosting/kb/:kbId",
        element: withRouteSuspense(<KbDetailPage />),
      },
      {
        path: "chat/ai-hosting/kb/:kbId/docs/:docId",
        element: withRouteSuspense(<KbDocDetailPage />),
      },
      {
        path: "chat/ai-hosting/skills",
        element: withRouteSuspense(<AiSkillsPage />),
      },
      {
        path: "chat/ai-hosting/skills/new",
        element: withRouteSuspense(<AiSkillSettingsPage />),
      },
      {
        path: "chat/ai-hosting/skills/:skillId/edit",
        element: withRouteSuspense(<AiSkillSettingsPage />),
      },
      {
        path: "chat/ai-hosting/user-memory",
        element: withRouteSuspense(<UserMemoryPage />),
      },
      {
        path: "chat/ai-hosting/hosting-settings",
        element: withRouteSuspense(<AgentHostingSettingsPage />),
      },
      {
        path: "chat/ai-hosting/subscription",
        element: withRouteSuspense(<AgentSubscriptionPage />),
      },
      {
        path: "*",
        element: withRouteSuspense(<NotFoundPage />),
      },
    ],
  },
];

export const router = createBrowserRouter(routerConfig);
