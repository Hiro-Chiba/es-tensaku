"use client";

import { useCallback, useMemo, useState } from "react";
import { marked } from "marked";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useReviewHistory } from "@/hooks/useReviewHistory";
import { toCsv } from "@/utils/csv";
import type {
  EssayInput,
  EssayEvaluation,
  EssayImprovement,
  GeminiReviewOutput,
  ReviewStreamEvent,
  ReviewStreamEventType
} from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { createImprovedEssay, evaluateEssay } from "@/lib/esScoring";

interface ReviewState {
  status: "idle" | "running" | "error";
  message?: string;
  result?: GeminiReviewOutput;
}

const focusOptions = [
  { value: "motivation", label: "志望動機" },
  { value: "gakuchika", label: "学生時代に頑張ったこと" },
  { value: "selfPr", label: "自己PR" }
] as const;

const focusLabelMap = Object.fromEntries(
  focusOptions.map((option) => [option.value, option.label])
) as Record<(typeof focusOptions)[number]["value"], string>;

const sectionLabels: Record<keyof GeminiReviewOutput["sectionScores"], string> = {
  content: "内容・意図の明確さ",
  organisation: "構成・論理性",
  language: "表現・言葉遣い",
  mechanics: "日本語の正確さ"
};

const actionPlanPriorityClass: Record<"high" | "medium" | "low", string> = {
  high: "text-emerald-600",
  medium: "text-amber-600",
  low: "text-slate-500"
};

async function parseEventStream(response: Response, onEvent: (event: ReviewStreamEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data:")) continue;
      const json = part.replace(/^data:\s*/, "");
      try {
        const event = JSON.parse(json) as ReviewStreamEvent;
        onEvent(event);
      } catch (error) {
        console.error("Failed to parse event", error);
      }
    }
  }
}

export default function Page() {
  const { records, saveRecord, clearHistory, isReady } = useReviewHistory();
  const [essay, setEssay] = useState("");
  const [topic, setTopic] = useState("");
  const [focus, setFocus] = useState<typeof focusOptions[number]["value"]>(focusOptions[0].value);
  const [targetCharacterCount, setTargetCharacterCount] = useState<number | undefined>();
  const [tone, setTone] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [state, setState] = useState<ReviewState>({ status: "idle" });
  const [events, setEvents] = useState<ReviewStreamEventType[]>([]);
  const [clientEvaluation, setClientEvaluation] = useState<EssayEvaluation | null>(null);
  const [improvedEvaluation, setImprovedEvaluation] = useState<EssayEvaluation | null>(null);
  const [improvement, setImprovement] = useState<EssayImprovement | null>(null);

  const progressValue = useMemo(() => {
    if (state.status === "idle") return 0;
    if (state.status === "error") return 100;
    const map: Record<ReviewStreamEventType, number> = {
      preprocess: 25,
      "gemini-requested": 50,
      persisted: 75,
      completed: 100,
      error: 100
    };
    return events.reduce((acc, event) => Math.max(acc, map[event] ?? acc), 10);
  }, [state.status, events]);

  const scoreGain = useMemo(() => {
    if (!clientEvaluation || !improvedEvaluation) return null;
    return improvedEvaluation.score - clientEvaluation.score;
  }, [clientEvaluation, improvedEvaluation]);

  const handleSubmit = useCallback(async () => {
    if (!agreeToTerms) {
      toast.error("利用規約に同意してください");
      setState({ status: "error", message: "利用規約に同意してください" });
      return;
    }
    const charCount = essay.replace(/\s+/g, "").length;
    if (charCount < 200) {
      const message = "エントリーシートは最低200文字以上入力してください";
      toast.error(message);
      setState({ status: "error", message });
      return;
    }
    const evaluationOptions = {
      topic: topic || undefined,
      targetCharacterCount,
      tone: tone || undefined
    };
    const evaluation = evaluateEssay(essay, focus, evaluationOptions);
    let nextImprovement = createImprovedEssay(essay, focus, {
      ...evaluationOptions,
      evaluation
    });
    let nextImprovedEvaluation = evaluateEssay(nextImprovement.text, focus, evaluationOptions);
    if (nextImprovedEvaluation.score <= evaluation.score) {
      const structuredImprovement = createImprovedEssay(essay, focus, {
        ...evaluationOptions,
        evaluation,
        forceStructured: true
      });
      const structuredEvaluation = evaluateEssay(structuredImprovement.text, focus, evaluationOptions);
      if (structuredEvaluation.score > nextImprovedEvaluation.score) {
        nextImprovement = structuredImprovement;
        nextImprovedEvaluation = structuredEvaluation;
      }
    }
    setClientEvaluation(evaluation);
    setImprovement(nextImprovement);
    setImprovedEvaluation(nextImprovedEvaluation);
    setState({ status: "running" });
    setEvents([]);
    const payload: EssayInput = {
      content: essay,
      topic: topic || undefined,
      settings: {
        focus,
        targetCharacterCount,
        tone: tone || undefined
      },
      agreeToTerms
    };

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok || !response.body) {
        const message = await response.text();
        throw new Error(message || "添削リクエストに失敗しました。");
      }
      await parseEventStream(response, (event) => {
        setEvents((prev) => [...prev, event.type]);
        if (event.type === "error") {
          setState({ status: "error", message: String(event.message ?? "エラーが発生しました。") });
          toast.error(event.message ?? "エラーが発生しました");
        }
        if (event.type === "completed") {
          const result = event.payload as GeminiReviewOutput;
          setState({ status: "idle", result });
          const record = {
            id: nanoid(),
            essay: payload,
            result,
            createdAt: new Date().toISOString()
          };
          void saveRecord(record);
          toast.success("添削が完了しました");
        }
      });
    } catch (error) {
      console.error(error);
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      toast.error(error instanceof Error ? error.message : "不明なエラーが発生しました");
    }
  }, [agreeToTerms, essay, focus, saveRecord, targetCharacterCount, tone, topic]);

  const downloadCsv = useCallback(() => {
    const csv = toCsv(records);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `es-tensaku-history-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [records]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2 text-center">
        <Badge variant="success">AI 添削エンジン搭載</Badge>
        <h1 className="text-4xl font-bold tracking-tight">ES-tensaku</h1>
        <p className="text-slate-600">
          志望動機やガクチカなどのエントリーシート文章を貼り付けて、数十秒でビジネス視点のフィードバックを受け取りましょう。
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>エントリーシートの内容を入力</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">テーマ / 応募先 (任意)</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="例: 株式会社◯◯への志望動機"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">添削したい項目</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={focus}
                    onChange={(event) =>
                      setFocus(event.target.value as (typeof focusOptions)[number]["value"])
                    }
                  >
                    {focusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">目標文字数 (任意)</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="例: 400"
                    value={targetCharacterCount ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setTargetCharacterCount(value ? Number(value) : undefined);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">トーン (任意)</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="例: 誠実・熱意が伝わる語り口"
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">本文</label>
                <textarea
                  rows={12}
                  value={essay}
                  onChange={(event) => setEssay(event.target.value)}
                  placeholder="ここに志望動機や学生時代に力を入れたことなどの文章を貼り付けてください。Markdown も利用できます。"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={agreeToTerms}
                  onChange={(event) => setAgreeToTerms(event.target.checked)}
                />
                利用規約に同意します。
              </label>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={state.status === "running"}
                >
                  {state.status === "running" ? "添削中..." : "AI に送信"}
                </button>
                {state.status !== "idle" && (
                  <div className="space-y-2">
                    <Progress value={progressValue} />
                    {state.message && <p className="text-sm text-rose-600">{state.message}</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {clientEvaluation && (
            <Card>
              <CardHeader>
                <CardTitle>ESスコア診断</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-sm text-slate-500">入力テキストのスコア</div>
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-bold">{clientEvaluation.score}</span>
                        <span className="text-sm text-slate-500">/ 100</span>
                      </div>
                    </div>
                    {scoreGain !== null && (
                      <div className="text-right">
                        <div className="text-sm text-slate-500">改善後差分</div>
                        <span
                          className={`text-base font-semibold ${
                            scoreGain >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {scoreGain >= 0 ? `+${scoreGain}` : scoreGain}
                        </span>
                      </div>
                    )}
                  </div>
                  <Progress value={clientEvaluation.score} className="mt-3" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {clientEvaluation.groupSummaries.map((summary) => {
                    const coverageInfo = clientEvaluation.coverage.groups.find(
                      (group) => group.group === summary.group
                    );
                    return (
                      <div key={summary.group} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-500">{summary.group}</div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-lg font-bold text-slate-800">{summary.percentage}</span>
                          <span className="text-xs text-slate-500">/100</span>
                        </div>
                        <Progress value={summary.percentage} className="mt-2" />
                        {coverageInfo && (
                          <p className="mt-2 text-xs text-slate-500">
                            {coverageInfo.satisfied}/{coverageInfo.total}項目クリア（{coverageInfo.percentage}%）
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">ルーブリック達成率</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{clientEvaluation.coverage.percentage}</span>
                    <span className="text-xs text-slate-500">/100</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {clientEvaluation.coverage.satisfied} / {clientEvaluation.coverage.totalCriteria} 項目を達成
                  </p>
                  <Progress value={clientEvaluation.coverage.percentage} className="mt-3" />
                </div>

                {clientEvaluation.topAdvice.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">優先改善ポイント</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {clientEvaluation.topAdvice.map((advice, index) => (
                        <li key={index}>{advice}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {clientEvaluation.actionPlan.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">アクションプラン</h3>
                    <ol className="space-y-3 text-sm">
                      {clientEvaluation.actionPlan.map((item, index) => (
                        <li
                          key={`${item.title}-${index}`}
                          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800">{index + 1}. {item.title}</span>
                            <span className={`text-xs font-semibold ${actionPlanPriorityClass[item.priority]}`}>
                              {item.priority === "high"
                                ? "優先度: 高"
                                : item.priority === "medium"
                                  ? "優先度: 中"
                                  : "優先度: 低"}
                            </span>
                          </div>
                          <p className="mt-2 text-slate-700">{item.summary}</p>
                          {item.rubricIds.length > 0 && (
                            <p className="mt-1 text-xs text-slate-500">
                              対応ルーブリック: {item.rubricIds.map((id) => `#${id}`).join(", ")}
                            </p>
                          )}
                          {item.suggestions.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                              {item.suggestions.map((suggestion, suggestionIndex) => (
                                <li key={suggestionIndex}>{suggestion}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>最近の履歴</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={downloadCsv} disabled={!records.length}>
                  CSV エクスポート
                </button>
                <button
                  type="button"
                  className="bg-slate-200 text-slate-700 hover:bg-slate-300"
                  onClick={() => void clearHistory()}
                  disabled={!records.length}
                >
                  履歴をクリア
                </button>
                {!isReady && <span className="text-sm text-slate-500">履歴を読み込み中...</span>}
              </div>
              <div className="space-y-3">
                {records.length === 0 && <p className="text-sm text-slate-600">履歴はまだありません。</p>}
                {records.map((record) => (
                  <div key={record.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge>{focusLabelMap[record.essay.settings.focus]}</Badge>
                        <span className="font-medium">スコア: {record.result.overallScore}</span>
                      </div>
                      <span className="text-xs text-slate-500">{formatDate(record.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {record.essay.topic ?? "(トピック未設定)"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {improvement && improvedEvaluation && (
            <Card>
              <CardHeader>
                <CardTitle>ロジックを満たした改善文章</CardTitle>
                <p className="text-sm text-slate-500">{improvement.summary}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-sm text-slate-500">改善後スコア</div>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-bold text-brand">{improvedEvaluation.score}</span>
                    <span className="text-sm text-slate-500">/ 100</span>
                    {clientEvaluation && scoreGain !== null && (
                      <span
                        className={`text-sm font-semibold ${
                          scoreGain >= 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {scoreGain >= 0 ? `+${scoreGain}` : scoreGain}
                      </span>
                    )}
                  </div>
                  <Progress value={improvedEvaluation.score} className="mt-3" />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <article className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {improvement.text}
                  </article>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {improvedEvaluation.groupSummaries.map((summary) => (
                    <div key={summary.group} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-xs font-semibold text-slate-500">{summary.group}</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-xl font-bold text-slate-900">{summary.percentage}</span>
                        <span className="text-xs text-slate-500">/ 100</span>
                      </div>
                      <Progress value={summary.percentage} className="mt-2" />
                    </div>
                  ))}
                </div>

                {improvement.appliedStrategies.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">反映した改善戦略</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {improvement.appliedStrategies.map((strategy, index) => (
                        <li key={index}>{strategy}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {state.result && (
            <Card>
              <CardHeader>
                <CardTitle>Gemini 添削結果</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <section className="space-y-2">
                  <h2 className="text-xl font-semibold">総合スコア</h2>
                  <p className="text-4xl font-bold">{state.result.overallScore}</p>
                  <div className="space-y-2">
                    {Object.entries(state.result.sectionScores).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span>{sectionLabels[key as keyof typeof sectionLabels] ?? key}</span>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">改善ポイント</h3>
                    <ul className="list-disc space-y-1 pl-4 text-sm">
                      {state.result.topImprovementPoints.map((point, index) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">サマリ</h3>
                    <article
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: marked.parse(state.result.summaryMarkdown) as string }}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">リライト提案</h3>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{state.result.rewriteSuggestion}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">学習タスク</h3>
                    <ul className="list-disc space-y-1 pl-4 text-sm">
                      {state.result.learningTasks.map((task, index) => (
                        <li key={index}>{task}</li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="md:col-span-2 space-y-3">
                  <h3 className="text-sm font-semibold">指摘一覧</h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {state.result.inlineIssues.map((issue, index) => (
                      <div key={index} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <Badge
                            variant={
                              issue.severity === "major"
                                ? "danger"
                                : issue.severity === "minor"
                                ? "warning"
                                : "default"
                            }
                          >
                            {issue.category}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {issue.startIndex} - {issue.endIndex}
                          </span>
                        </div>
                        <p className="mt-2 font-medium">{issue.message}</p>
                        <p className="text-xs text-slate-600">{issue.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
