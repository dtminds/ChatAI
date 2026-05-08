import { Navigate, createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { LoginPage } from "@/pages/auth/login-page";
import { ChatWorkbenchRoutePage } from "@/pages/chat/chat-workbench-page";
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
