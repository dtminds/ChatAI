# Insights Module SQL Review

Branch: `codex/conversation-insights-specs`

## Overview

Analysis of all new SQL queries introduced by the Insights module against the new MySQL tables.
Focus: complex JOINs, Cartesian product risks, and whether splitting queries + code-side assembly is beneficial.

## Optimization Items

| # | File | Query | Risk | Status |
|---|------|-------|------|--------|
| 1 | [01-list-current-sessions.md](01-list-current-sessions.md) | `listCurrentSessions` | HIGH | Pending |
| 2 | [02-find-detail.md](02-find-detail.md) | `findDetail` | HIGH | Pending |
| 3 | [03-list-entity-hotspots.md](03-list-entity-hotspots.md) | `listEntityHotspots` | MEDIUM | Pending |
| 4 | [04-list-business-topic-facts.md](04-list-business-topic-facts.md) | `listBusinessTagFacts` / `listBusinessEntityFacts` / `listBusinessIntentFacts` | MEDIUM | Pending |
| 5 | [05-list-action-items.md](05-list-action-items.md) | `listActionItems` | MEDIUM | Pending |

## PASS (No Action Needed)

- Configuration CRUD (sessionization, analysis_policy, label_config, qa_rule_config, entity_dictionary)
- Worker queue operations (`claimNextSyncMessagesJob`, `claimNextAnalyzeJob`)
- Incremental message sync (`listIncrementalMessages`)
- Session message analysis (`listSessionMessagesForAnalysis`)
- Evidence messages query (`listEvidenceMessages`)
- `updateActionStatus` authorization check
- `findOpenSession`, `listClosableOpenSessions`
- `saveAnalysisResult` write operations
- `shouldCreateLiveAnalyzeJob`
