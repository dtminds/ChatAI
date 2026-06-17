import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@/app/root-layout";

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
  return <Suspense fallback={null}>{element}</Suspense>;
}

export const routerConfig = [
  {
    path: "/",
    element: <RootLayout />,
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
    ],
  },
];

export const router = createBrowserRouter(routerConfig);
