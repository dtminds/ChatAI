# Customer Page Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while implementing this plan. This branch intentionally uses the current working directory, not a worktree.

**Goal:** Build the `/chat/customers` customer page with `我的客户` and `全部客户` views, backed by shared contracts and backend customer list/detail endpoints.

**Architecture:** Add customer DTOs to `@chatai/contracts`, expose read-only `/api/server/customers` and `/api/server/customers/:customerKey` endpoints from the chat module, and add a web customer page that reuses the existing chat shell/navigation patterns. `我的客户` is scoped by visible seats and supports a seat filter; `全部客户` is customer-library browsing and does not show a seat filter.

**Tech Stack:** TypeScript, TypeBox contracts, Fastify, Kysely, Vite React, shadcn/ui, Hugeicons, Vitest, Testing Library.

---

## Tasks

1. Add contract tests and DTOs for customer list/detail payloads.
2. Add backend service/repository tests for customer aggregation and implement endpoints.
3. Add web service tests for `/server/customers` requests.
4. Add route/navigation/page tests for customer page interactions.
5. Implement customer page UI and wire AccountRail navigation.
6. Run required verification: contracts build/test, backend build/test, web build/test, `git diff --check`.
