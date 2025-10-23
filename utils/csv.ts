import type { ReviewRecord } from "@/lib/types";

export function toCsv(records: ReviewRecord[]): string {
  const header = [
    "id",
    "createdAt",
    "focus",
    "wordCount",
    "overallScore",
    "summary"
  ];
  const rows = records.map((record) => {
    const summary = record.result.summaryMarkdown.replace(/\s+/g, " ");
    const wordCount = record.essay.content.trim().split(/\s+/).filter(Boolean).length;
    return [
      record.id,
      record.createdAt,
      record.essay.settings.focus,
      wordCount,
      record.result.overallScore,
      JSON.stringify(summary)
    ];
  });
  return [header, ...rows]
    .map((row) => row.join(","))
    .join("\n");
}
