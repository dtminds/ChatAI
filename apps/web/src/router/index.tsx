import { Navigate, createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { LoginPage } from "@/pages/auth/login-page";
import { ChatWorkbenchRoutePage } from "@/pages/chat/chat-workbench-page";
import { ChatInsightsPage } from "@/pages/chat/insights/chat-insights-page";
import { ChatSettingsPage } from "@/pages/chat/settings/chat-settings-page";

const demoRoutes = import.meta.env.DEV
  ? [
      {
        path: "/demo/insights",
        element: <ChatInsightsPage />,
      },
    ]
  : [];

export const routerConfig = [
  ...demoRoutes,
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
        path: "chat/insights",
        element: <ChatInsightsPage />,
      },
      {
        path: "chat/settings",
        element: <ChatSettingsPage />,
      },
      {
        path: "chat/settings/:sectionId",
        element: <ChatSettingsPage />,
      },
    ],
  },
];

export const router = createBrowserRouter(routerConfig);
