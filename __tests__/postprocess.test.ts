import { createInlineDiff, deriveConfidence, summariseIssues } from "@/lib/postprocess";
import type { GeminiReviewOutput } from "@/lib/types";

describe("postprocess utilities", () => {
  it("creates human readable diff", () => {
    const diffs = createInlineDiff("hello world", "hello brave world");
    expect(diffs.some((diff) => diff.type === "insert" && diff.value.includes("brave"))).toBe(true);
  });

  it("summarises inline issues", () => {
    const summary = summariseIssues([
      { startIndex: 0, endIndex: 4, category: "Grammar", severity: "minor", message: "Fix", suggestion: "Fix it" },
      { startIndex: 5, endIndex: 9, category: "Grammar", severity: "major", message: "Fix", suggestion: "Fix it" },
      { startIndex: 10, endIndex: 12, category: "Vocabulary", severity: "info", message: "Fix", suggestion: "Fix it" }
    ]);
    expect(summary.Grammar).toBe(2);
    expect(summary.Vocabulary).toBe(1);
  });

  it("applies confidence deductions based on severity", () => {
    const result: GeminiReviewOutput = {
      overallScore: 80,
      summaryMarkdown: "",
      sectionScores: { content: 20, organisation: 20, language: 20, mechanics: 20 },
      topImprovementPoints: ["A", "B", "C"],
      inlineIssues: [
        { startIndex: 0, endIndex: 1, category: "Grammar", severity: "major", message: "", suggestion: "" },
        { startIndex: 2, endIndex: 3, category: "Mechanics", severity: "minor", message: "", suggestion: "" }
      ],
      rewriteSuggestion: "",
      learningTasks: ["Task 1", "Task 2"],
      confidence: 0.9,
      tokenUsage: []
    };
    expect(deriveConfidence(result)).toBeCloseTo(0.83, 2);
  });
});
