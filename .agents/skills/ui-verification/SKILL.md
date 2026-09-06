---
name: ui-verification
description: Use when implementing or reviewing this project's frontend UI, or when the user asks for visual, responsive, layout, or browser verification. Use the isolated Codex browser and establish the local test session through /e2e_login before inspecting authenticated pages.
---

# UI Verification

When authenticated browser inspection is needed:

1. Use the isolated Codex browser, never the user's existing browser session.
2. Open the local application's `/e2e_login` route first.
3. Confirm the browser reaches the authenticated workbench, then inspect only pages affected by the change.
4. Prefer build and component tests for non-visual changes; use browser inspection for layout, responsive behavior, routing, and real rendering.
5. Capture screenshots only when visual comparison is relevant.
6. Keep local environment values, session cookies, and account details out of code, screenshots, logs, and replies.

The `/e2e_login` route is available only when the backend explicitly enables it in a non-production environment and maps it to the dedicated test user.
