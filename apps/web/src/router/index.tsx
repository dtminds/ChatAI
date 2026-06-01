import { Navigate, createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { LoginPage } from "@/pages/auth/login-page";
import { ChatWorkbenchRoutePage } from "@/pages/chat/chat-workbench-page";
import { InsightsFollowUpsPage } from "@/pages/chat/insights/insights-follow-ups-page";
import { InsightsOverviewPage } from "@/pages/chat/insights/insights-overview-page";
import { InsightsQualityPage } from "@/pages/chat/insights/insights-quality-page";
import { InsightsSettingsPage } from "@/pages/chat/insights/insights-settings-page";
import { InsightsPlaceholder } from "@/pages/chat/insights/insights-layout";
import { ChatSettingsPage } from "@/pages/chat/settings/chat-settings-page";

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
        element: <LoginPage />,
      },
      {
        path: "chat",
        element: <ChatWorkbenchRoutePage />,
      },
      {
        path: "chat/customers",
        element: <ChatWorkbenchRoutePage />,
      },
      {
        path: "chat/settings",
        element: <ChatSettingsPage />,
      },
      {
        path: "chat/settings/:sectionId",
        element: <ChatSettingsPage />,
      },
      {
        path: "chat/insights",
        element: <InsightsOverviewPage />,
      },
      {
        path: "chat/insights/quality",
        element: <InsightsQualityPage />,
      },
      {
        path: "chat/insights/follow-ups",
        element: <InsightsFollowUpsPage />,
      },
      {
        path: "chat/insights/business",
        element: <InsightsPlaceholder title="经营洞察" />,
      },
      {
        path: "chat/insights/records",
        element: <InsightsPlaceholder title="分析明细" />,
      },
      {
        path: "chat/insights/settings",
        element: <InsightsSettingsPage />,
      },
    ],
  },
];

export const router = createBrowserRouter(routerConfig);
