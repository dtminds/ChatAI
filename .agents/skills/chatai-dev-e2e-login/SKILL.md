---
name: chatai-dev-e2e-login
description: Use when an Agent needs to log in to the ChatAI development environment, establish an authenticated session, or recover from a failed development login. This skill only defines ChatAI's development login entrypoint and diagnostic handling; use the Agent's available interaction tools independently.
---

# ChatAI Development E2E Login

When ChatAI development authentication is required:

1. Use the project's `/e2e_login` entrypoint to establish the session.
2. Use the already running ChatAI development services. Do not start, restart, or stop services as part of login.
3. On failure, report the exact error returned by the entrypoint and stop. Do not retry blindly.
4. Interpret the known errors as follows:
   - `E2E 登录未启用`: configure `E2E_LOGIN_ENABLED=true` in the backend local environment.
   - `E2E 登录账号未配置`: configure `E2E_LOGIN_USER_ID` in the backend local environment.
   - `E2E_LOGIN账号不存在或已停用`: check that `E2E_LOGIN_USER_ID` identifies an active ChatAI account.
5. Keep local environment values, session cookies, and account details out of source files, screenshots, logs, and final responses.

A successful request establishes the normal ChatAI application session and redirects to the authenticated workbench.
