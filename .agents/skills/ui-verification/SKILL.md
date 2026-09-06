---
name: ui-verification
description: Use when implementing or reviewing this project's frontend UI, or when the user asks for visual, responsive, layout, or browser verification. Use the isolated Codex browser and establish the local test session through /e2e_login before inspecting authenticated pages.
---

# UI Verification

When authenticated browser inspection is needed:

1. Use the isolated Codex browser, never the user's existing browser session.
2. Use the already running local frontend and backend instances.
3. Do not start, restart, or stop frontend or backend processes for UI verification. Do not run dev, start, preview, or equivalent server commands.
4. Open the existing frontend URL and navigate to `/e2e_login` first.
5. If the frontend cannot be reached, stop browser work and tell the user to start the frontend.
6. If `/e2e_login` cannot reach the backend, stop browser work and tell the user to start the backend or check the frontend proxy.
7. Treat the error shown by `/e2e_login` as diagnostic. Report the specific missing setting or unavailable test account instead of retrying blindly.
8. After successful login, inspect only pages affected by the change.
9. Prefer build and component tests for non-visual changes; use browser inspection for layout, responsive behavior, routing, and real rendering.
10. Capture screenshots only when visual comparison is relevant.
11. Keep local environment values, session cookies, and account details out of code, screenshots, logs, and replies.

The `/e2e_login` route is available in local development and uses the dedicated non-production test user configured by the backend.
