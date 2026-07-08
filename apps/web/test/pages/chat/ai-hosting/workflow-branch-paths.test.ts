import { describe, expect, it } from "vitest";
import {
  addWorkflowBranchPath,
  getWorkflowBranchPaths,
  moveWorkflowBranchPath,
  normalizeWorkflowBranchPaths,
  removeWorkflowBranchPath,
  renameWorkflowBranchPath,
} from "@/pages/chat/ai-hosting/workflow/branch-paths";
import type { WorkflowBranchPath } from "@/pages/chat/ai-hosting/workflow/types";

describe("workflow branch paths", () => {
  it("normalizes branch paths with a single fallback path kept last", () => {
    const paths: WorkflowBranchPath[] = [
      { id: "fallback", isDefault: true, label: "默认", operator: "IF", title: "CASE 1" },
      { id: "vip", label: "VIP", operator: "ELSE", title: "CASE 9" },
      { id: "normal", label: "普通", operator: "IF", title: "CASE 8" },
    ];

    expect(normalizeWorkflowBranchPaths(paths)).toEqual([
      { id: "vip", isDefault: undefined, label: "VIP", operator: "IF", title: "CASE 1" },
      { id: "normal", isDefault: undefined, label: "普通", operator: "ELIF", title: "CASE 2" },
      { id: "fallback", isDefault: true, label: "默认", operator: "ELSE", title: "CASE 3" },
    ]);
  });

  it("adds new paths before ELSE and keeps generated metadata ordered", () => {
    const nextPaths = addWorkflowBranchPath(getWorkflowBranchPaths(), "branch-new");

    expect(nextPaths.map((path) => path.id)).toEqual([
      "branch-high",
      "branch-normal",
      "branch-new",
      "branch-default",
    ]);
    expect(nextPaths.map((path) => path.operator)).toEqual(["IF", "ELIF", "ELIF", "ELSE"]);
    expect(nextPaths.map((path) => path.title)).toEqual(["CASE 1", "CASE 2", "CASE 3", "CASE 4"]);
  });

  it("renames paths without changing ids or branch order", () => {
    const nextPaths = renameWorkflowBranchPath(getWorkflowBranchPaths(), "branch-normal", "复购客户");

    expect(nextPaths.map((path) => path.id)).toEqual([
      "branch-high",
      "branch-normal",
      "branch-default",
    ]);
    expect(nextPaths.find((path) => path.id === "branch-normal")?.label).toBe("复购客户");
  });

  it("does not remove ELSE or the last non-default path", () => {
    const singleCasePaths: WorkflowBranchPath[] = [
      { id: "only-case", label: "唯一条件", operator: "IF", title: "CASE 1" },
      { id: "fallback", isDefault: true, label: "默认", operator: "ELSE", title: "CASE 2" },
    ];

    expect(removeWorkflowBranchPath(singleCasePaths, "fallback")).toEqual(normalizeWorkflowBranchPaths(singleCasePaths));
    expect(removeWorkflowBranchPath(singleCasePaths, "only-case")).toEqual(normalizeWorkflowBranchPaths(singleCasePaths));
  });

  it("removes and reorders only non-default paths", () => {
    const movedPaths = moveWorkflowBranchPath(getWorkflowBranchPaths(), "branch-normal", "up");
    const removedPaths = removeWorkflowBranchPath(movedPaths, "branch-normal");

    expect(movedPaths.map((path) => path.id)).toEqual([
      "branch-normal",
      "branch-high",
      "branch-default",
    ]);
    expect(movedPaths.map((path) => path.operator)).toEqual(["IF", "ELIF", "ELSE"]);
    expect(removedPaths.map((path) => path.id)).toEqual(["branch-high", "branch-default"]);
    expect(removedPaths.map((path) => path.operator)).toEqual(["IF", "ELSE"]);
  });
});
