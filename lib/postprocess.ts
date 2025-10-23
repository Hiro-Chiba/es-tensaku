import DiffMatchPatch from "diff-match-patch";
import type { GeminiReviewOutput, InlineIssue } from "@/lib/types";

const dmp = new DiffMatchPatch();

type DiffSegment = {
  value: string;
  type: "equal" | "insert" | "delete";
};

type DiffTuple = [number, string];

export function createInlineDiff(original: string, revised: string): DiffSegment[] {
  const diffs = dmp.diff_main(original, revised) as DiffTuple[];
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([type, value]) => ({
    value,
    type: type === 0 ? "equal" : type === 1 ? "insert" : "delete"
  }));
}

export function summariseIssues(issues: InlineIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.category] = (acc[issue.category] ?? 0) + 1;
    return acc;
  }, {});
}

export function deriveConfidence(result: GeminiReviewOutput): number {
  const base = result.confidence;
  const deductions = result.inlineIssues.reduce((acc, issue) => {
    return acc + (issue.severity === "major" ? 0.05 : issue.severity === "minor" ? 0.02 : 0);
  }, 0);
  return Math.max(0, Math.min(1, base - deductions));
}
