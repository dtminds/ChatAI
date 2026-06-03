# 02 - findDetail Fix Report

## Review Validity

Valid. The detail query joined QA findings, risks, action items, problem evidence, messages, contacts, and seats into a single query. QA, risk, action, and evidence rows are all one-to-many by snapshot, so the detail query could produce an `N x M x K` intermediate result before downstream deduplication.

## Fix Applied

- Reduced the detail core query to current snapshot, logical session, summary, and problem-resolution data.
- Removed direct joins to QA findings, risks, action items, problem evidence, messages, contacts, and seats from the detail core query.
- Loaded QA findings and risks through snapshot-scoped follow-up queries.
- Loaded detail action items through a snapshot-scoped action query, then reused bounded action evidence hydration.
- Reused current-session aggregate hydration for problem evidence, risk counts, open action count, and latest evidence timestamp.
- Kept contact/seat hydration through the existing actor/customer hydration helpers.

## Notes

- The review's recommendation to reuse actor hydration was accepted.
- Detail still uses `listDimensionEvidence` for dimension evidence mapping, preserving evidence IDs for QA/risk/tag/entity/intent/FAQ DTOs.

## Verification

- Covered by `loads detail qa findings, risks, and actions through focused snapshot queries`.
- Verified with `pnpm --filter @chatai/backend test test/modules/insights/insights-repository.test.ts`.
- Verified with `pnpm --filter @chatai/backend build`.
