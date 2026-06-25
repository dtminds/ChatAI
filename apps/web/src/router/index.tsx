import { Suspense, lazy, useEffect, type ReactNode } from "react";
import {
  Navigate,
  createBrowserRouter,
  useRouteError,
} from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";

const LoginPage = lazy(() =>
  import("@/pages/auth/login-page").then(({ LoginPage }) => ({
    default: LoginPage,
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
const AgentSettingsPage = lazy(() =>
  import("@/pages/chat/ai-hosting/agent-settings-page").then(({ AgentSettingsPage }) => ({
    default: AgentSettingsPage,
  })),
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
const InsightsFollowUpsPage = lazy(() =>
  import("@/pages/chat/insights/insights-follow-ups-page").then(
    ({ InsightsFollowUpsPage }) => ({
      default: InsightsFollowUpsPage,
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

export const routerConfig = [
  {
    path: "/",
    element: <RootLayout />,
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
        path: "chat",
        element: withRouteSuspense(<ChatWorkbenchRoutePage />),
      },
      {
        path: "chat/customers",
        element: withRouteSuspense(<ChatWorkbenchRoutePage />),
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
        element: withRouteSuspense(<InsightsOverviewPage />),
      },
      {
        path: "chat/insights/quality",
        element: withRouteSuspense(<InsightsQualityPage />),
      },
      {
        path: "chat/insights/follow-ups",
        element: withRouteSuspense(<InsightsFollowUpsPage />),
      },
      {
        path: "chat/insights/business",
        element: withRouteSuspense(<InsightsBusinessPage />),
      },
      {
        path: "chat/insights/records",
        element: <Navigate replace to="/chat/insights" />,
      },
      {
        path: "chat/insights/settings",
        element: withRouteSuspense(<InsightsSettingsPage />),
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
        path: "chat/ai-hosting/agents/new",
        element: withRouteSuspense(<AgentSettingsPage />),
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
        path: "chat/ai-hosting/hosting-settings",
        element: withRouteSuspense(<AgentHostingSettingsPage />),
      },
    ],
  },
];

export const router = createBrowserRouter(routerConfig);
