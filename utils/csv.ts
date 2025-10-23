import type { ReviewRecord } from "@/lib/types";

const focusLabelMap: Record<ReviewRecord["essay"]["settings"]["focus"], string> = {
  motivation: "志望動機",
  gakuchika: "学生時代に頑張ったこと",
  selfPr: "自己PR"
};

export function toCsv(records: ReviewRecord[]): string {
  const header = [
    "id",
    "createdAt",
    "focus",
    "characterCount",
    "overallScore",
    "summary"
  ];
  const rows = records.map((record) => {
    const summary = record.result.summaryMarkdown.replace(/\s+/g, " ");
    const characterCount = record.essay.content.replace(/\s+/g, "").length;
    return [
      record.id,
      record.createdAt,
      focusLabelMap[record.essay.settings.focus],
      characterCount,
      record.result.overallScore,
      JSON.stringify(summary)
    ];
  });
  return [header, ...rows]
    .map((row) => row.join(","))
    .join("\n");
}
