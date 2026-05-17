# Frontend CI Containerization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new frontend CI workflow that runs the web checks directly on the mac-mini self-hosted runner while preserving cacheable pnpm installs and the existing change-detection behavior. Keep the current `frontend-ci.yml` untouched for easy rollback.

**Architecture:** Keep GitHub Actions as the orchestrator, but let the frontend job run natively on the self-hosted mac-mini runner. Use the runner's normal Node 24 + pnpm toolchain and rely on GitHub Actions' pnpm cache so installs stay fast without extra container layers. Keep the existing path filter job intact so the workflow only runs on frontend-relevant changes unless manually dispatched.

**Tech Stack:** GitHub Actions, self-hosted macOS runner, Node 24, Corepack, pnpm 10, Vite, Vitest, TypeScript.

---

### Task 1: Add a new native frontend CI workflow

**Files:**
- Create: `.github/workflows/frontend-ci-self-hosted.yml`

- [ ] **Step 1: Replace the hosted runner execution path with a native self-hosted frontend job**

```yaml
name: Frontend CI (Self-hosted)

on:
  push:
    branches:
      - main
      - dev
  pull_request:
    branches:
      - main
      - dev
  workflow_dispatch:

concurrency:
  group: frontend-ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: read

jobs:
  changes:
    name: Detect Frontend Changes
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Detect changed areas
        id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: |
            frontend:
              - ".env*"
              - ".github/workflows/ci.yml"
              - ".github/workflows/frontend-ci-self-hosted.yml"
              - "apps/web/**"
              - "package.json"
              - "packages/contracts/**"
              - "pnpm-lock.yaml"
              - "pnpm-workspace.yaml"
              - "tsconfig*.json"
              - "tsconfig.base.json"

  frontend:
    name: Frontend
    needs: changes
    if: github.event_name == 'workflow_dispatch' || needs.changes.outputs.frontend == 'true'
    runs-on: [self-hosted, mac-mini]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Enable pnpm
        run: corepack enable pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck frontend
        run: pnpm --filter @chatai/web typecheck

      - name: Test frontend
        run: pnpm --filter @chatai/web test

      - name: Build frontend
        run: pnpm --filter @chatai/web build
```

- [ ] **Step 2: Confirm the workflow still keeps the change filter and trigger semantics unchanged**

Check that `changes` still runs on `ubuntu-latest`, the frontend job still skips when unrelated files change, and manual dispatch still bypasses the filter.

- [ ] **Step 3: Verify the new job uses the self-hosted Node toolchain and pnpm cache**

Confirm the job uses `actions/setup-node@v4`, enables pnpm through Corepack, and relies on the hosted pnpm cache path rather than an extra container layer.

### Task 2: Validate the new workflow syntax and cache behavior

**Files:**
- Create: `.github/workflows/frontend-ci-self-hosted.yml`

- [ ] **Step 1: Run a diff hygiene check on the edited workflow**

Run: `git diff --check -- .github/workflows/frontend-ci-self-hosted.yml`
Expected: no output

- [ ] **Step 2: Inspect the final workflow for Node and pnpm setup correctness**

Run: `sed -n '1,240p' .github/workflows/frontend-ci-self-hosted.yml`
Expected: the Node version is pinned to 24, pnpm is enabled through Corepack, and the job runs its checks directly on the self-hosted runner.

- [ ] **Step 3: Commit the workflow change**

```bash
git add .github/workflows/frontend-ci-self-hosted.yml
git commit -m "ci: run frontend checks in docker on self-hosted runner"
```

### Task 3: Push the branch for review

**Files:**
- None

- [ ] **Step 1: Push the new branch**

```bash
git push -u origin codex/frontend-ci-container
```

- [ ] **Step 2: Report the exact branch name and the workflow file changed**

Confirm the branch is `codex/frontend-ci-container` and the only intended workflow change is `.github/workflows/frontend-ci-self-hosted.yml`.
