# Frontend CI Containerization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new frontend CI workflow that runs the web checks inside a Linux container on the mac-mini self-hosted runner while preserving cacheable pnpm installs and the existing change-detection behavior. Keep the current `frontend-ci.yml` untouched for easy rollback.

**Architecture:** Keep GitHub Actions as the orchestrator, but move the actual frontend verification into a containerized job step so the runtime matches a Linux CI image instead of macOS host tooling. Use a dedicated pnpm store mount on the runner host to reuse dependencies across runs without polluting the workspace or relying on `$HOME`. Keep the existing path filter job intact so the workflow only runs on frontend-relevant changes unless manually dispatched.

**Tech Stack:** GitHub Actions, self-hosted macOS runner, Docker, `node:24-bookworm-slim`, Corepack, pnpm 10, Vite, Vitest, TypeScript.

---

### Task 1: Add a new containerized frontend CI workflow

**Files:**
- Create: `.github/workflows/frontend-ci-self-hosted.yml`

- [ ] **Step 1: Replace the hosted runner execution path with a containerized frontend job**

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

      - name: Build in Docker
        run: |
          mkdir -p /var/cache/pnpm-store
          docker run --rm \
            -u "$(id -u):$(id -g)" \
            -v "${{ github.workspace }}:/workspace" \
            -v "/var/cache/pnpm-store:/pnpm-store" \
            -w /workspace \
            -e CI=true \
            node:24-bookworm-slim sh -lc '
              set -eu
              corepack enable
              pnpm install --frozen-lockfile --store-dir /pnpm-store
              pnpm --filter @chatai/web typecheck
              pnpm --filter @chatai/web test
              pnpm --filter @chatai/web build
            '
```

- [ ] **Step 2: Confirm the workflow still keeps the change filter and trigger semantics unchanged**

Check that `changes` still runs on `ubuntu-latest`, the frontend job still skips when unrelated files change, and manual dispatch still bypasses the filter.

- [ ] **Step 3: Verify the new job uses a Linux container image and a dedicated cache path**

Confirm the Docker image is `node:24-bookworm-slim`, the pnpm store is mounted at `/var/cache/pnpm-store`, and the job no longer depends on host-node or host-pnpm setup.

### Task 2: Validate the new workflow syntax and cache behavior

**Files:**
- Create: `.github/workflows/frontend-ci-self-hosted.yml`

- [ ] **Step 1: Run a diff hygiene check on the edited workflow**

Run: `git diff --check -- .github/workflows/frontend-ci-self-hosted.yml`
Expected: no output

- [ ] **Step 2: Inspect the final workflow for shell quoting and volume mount correctness**

Run: `sed -n '1,240p' .github/workflows/frontend-ci-self-hosted.yml`
Expected: the Docker command is syntactically valid, the host cache path is writable by the runner user, and the mounted workspace path matches `github.workspace`.

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
