import { Navigate, createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/chat" />,
      },
      {
        path: "chat",
        element: <ChatWorkbenchPage />,
      },
    ],
  },
]);
