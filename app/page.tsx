"use client";

import { useCallback, useMemo, useState } from "react";
import { marked } from "marked";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useReviewHistory } from "@/hooks/useReviewHistory";
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

const issueSeverityClass: Record<"info" | "minor" | "major", string> = {
  major: "bg-rose-100 text-rose-700",
  minor: "bg-amber-100 text-amber-700",
  info: "bg-slate-200 text-slate-700"
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
    const charCount = essay.replace(/\s+/g, "").length;
    if (charCount < 200) {
      const message = "エントリーシートは最低200文字以上入力してください";
      toast.error(message);
      setState({ status: "error", message });
      return;
    }
    const evaluationOptions = {
      topic: topic || undefined,
      targetCharacterCount
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
        targetCharacterCount
      }
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
  }, [essay, focus, saveRecord, targetCharacterCount, topic]);

  const displayedImprovedText = state.result?.rewriteSuggestion ?? improvement?.text ?? "";

  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 rounded-[40px] border-2 border-slate-300 bg-white px-8 py-12 shadow-sm">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-800">ES-tensaku</h1>
          <p className="mt-3 text-sm text-slate-500">
            シンプルな画面でエントリーシートの原文と改善案を並べて確認しながら、重点的な改善ポイントを把握できます。
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-2">
          <section className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-700">元の文</h2>
              <p className="mt-1 text-sm text-slate-500">入力した文章がそのまま表示されます。編集しながら AI に送信できます。</p>
            </div>
            <textarea
              rows={14}
              value={essay}
              onChange={(event) => setEssay(event.target.value)}
              placeholder="ここに志望動機や学生時代に力を入れたことなどの文章を貼り付けてください。Markdown も利用できます。"
              className="min-h-[320px] w-full flex-1 rounded-[32px] border-2 border-slate-300 bg-white p-5 text-sm leading-relaxed text-slate-800 shadow-inner focus:border-slate-500 focus:outline-none focus:ring-0"
            />
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={state.status === "running"}
                className="w-full rounded-full bg-slate-800 px-6 py-3 text-sm font-semibold tracking-wide text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
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

            {clientEvaluation && (
              <div className="space-y-6 rounded-[32px] border border-slate-200 bg-slate-50/60 p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">入力テキストのスコア</div>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="text-3xl font-bold text-slate-900">{clientEvaluation.score}</span>
                      <span className="text-sm text-slate-500">/ 100</span>
                    </div>
                  </div>
                  {scoreGain !== null && (
                    <div className="text-right">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">改善後差分</div>
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
                <Progress value={clientEvaluation.score} />

                <div className="grid gap-4 sm:grid-cols-2">
                  {clientEvaluation.groupSummaries.map((summary) => {
                    const coverageInfo = clientEvaluation.coverage.groups.find(
                      (group) => group.group === summary.group
                    );
                    return (
                      <div key={summary.group} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500">{summary.group}</div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-slate-900">{summary.percentage}</span>
                          <span className="text-xs text-slate-500">/ 100</span>
                        </div>
                        <Progress value={summary.percentage} className="mt-2" />
                        {coverageInfo && (
                          <p className="mt-2 text-xs text-slate-500">
                            {coverageInfo.satisfied}/{coverageInfo.total} 項目クリア（{coverageInfo.percentage}%）
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">ルーブリック達成率</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{clientEvaluation.coverage.percentage}</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {clientEvaluation.coverage.satisfied} / {clientEvaluation.coverage.totalCriteria} 項目を達成
                  </p>
                  <Progress value={clientEvaluation.coverage.percentage} className="mt-3" />
                </div>

                {clientEvaluation.topAdvice.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-700">優先改善ポイント</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {clientEvaluation.topAdvice.map((advice, index) => (
                        <li key={index}>{advice}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {clientEvaluation.actionPlan.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700">アクションプラン</h3>
                    <ol className="space-y-3 text-sm text-slate-700">
                      {clientEvaluation.actionPlan.map((item, index) => (
                        <li key={`${item.title}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
              </div>
            )}

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-700">添削条件</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">テーマ / 応募先 (任意)</label>
                  <input
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-0"
                    placeholder="例: 株式会社◯◯への志望動機"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">添削したい項目</label>
                  <select
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-0"
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
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">目標文字数 (任意)</label>
                <input
                  type="number"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-0"
                  placeholder="例: 400"
                  value={targetCharacterCount ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTargetCharacterCount(value ? Number(value) : undefined);
                  }}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-700">最近の履歴</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <button
                  type="button"
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {focusLabelMap[record.essay.settings.focus]}
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(record.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-800">スコア: {record.result.overallScore}</p>
                    <p className="text-xs text-slate-500">{record.essay.topic ?? "(トピック未設定)"}</p>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <section className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-700">後の文</h2>
              <p className="mt-1 text-sm text-slate-500">AI が提案する改善後の文章やサマリを確認できます。</p>
            </div>
            <div className="flex-1 rounded-[32px] border-2 border-dashed border-slate-300 bg-slate-50/70 p-6">
              <article className="min-h-[280px] whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {displayedImprovedText
                  ? displayedImprovedText
                  : "AI 添削が完了するとここに改善後の文章が表示されます。"}
              </article>
            </div>

            {improvement && (
              <div className="space-y-4 rounded-[32px] border border-slate-200 bg-white/80 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">改善概要</h3>
                  <p className="mt-1 text-sm text-slate-600">{improvement.summary}</p>
                </div>
                {improvement.appliedStrategies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">反映した改善戦略</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {improvement.appliedStrategies.map((strategy, index) => (
                        <li key={index}>{strategy}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {improvedEvaluation && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">改善案のスコア</div>
                        <div className="mt-1 flex items-end gap-2">
                          <span className="text-3xl font-bold text-slate-900">{improvedEvaluation.score}</span>
                          <span className="text-sm text-slate-500">/ 100</span>
                        </div>
                      </div>
                      {scoreGain !== null && (
                        <span
                          className={`text-base font-semibold ${
                            scoreGain >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {scoreGain >= 0 ? `+${scoreGain}` : scoreGain}
                        </span>
                      )}
                    </div>
                    <Progress value={improvedEvaluation.score} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {improvedEvaluation.groupSummaries.map((summary) => (
                        <div key={summary.group} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold text-slate-500">{summary.group}</div>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-xl font-bold text-slate-900">{summary.percentage}</span>
                            <span className="text-xs text-slate-500">/ 100</span>
                          </div>
                          <Progress value={summary.percentage} className="mt-2" />
                        </div>
                      ))}
                    </div>
                    {improvement.actionPlan && improvement.actionPlan.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-slate-700">即実行できるアクション</h3>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                          {improvement.actionPlan.map((item, index) => (
                            <li key={index}>{item.title}: {item.summary}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {state.result && (
              <div className="space-y-6">
                <div className="rounded-[32px] border border-slate-200 bg-white/80 p-6">
                  <h3 className="text-sm font-semibold text-slate-700">総合スコア</h3>
                  <div className="mt-3 flex items-baseline gap-3">
                    <span className="text-4xl font-bold text-slate-900">{state.result.overallScore}</span>
                    <span className="text-sm text-slate-500">/ 100</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {Object.entries(state.result.sectionScores).map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <div className="text-xs font-semibold text-slate-500">
                          {sectionLabels[key as keyof typeof sectionLabels] ?? key}
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-slate-900">{value}</span>
                          <span className="text-xs text-slate-500">/ 100</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">改善ポイント</h4>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {state.result.topImprovementPoints.map((point, index) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-[32px] border border-slate-200 bg-white/80 p-6 space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">サマリ</h3>
                    <article
                      className="prose prose-sm max-w-none text-slate-700"
                      dangerouslySetInnerHTML={{ __html: marked.parse(state.result.summaryMarkdown) as string }}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">リライト提案</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{state.result.rewriteSuggestion}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">学習タスク</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {state.result.learningTasks.map((task, index) => (
                        <li key={index}>{task}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {state.result.inlineIssues.length > 0 && (
                  <div className="rounded-[32px] border border-slate-200 bg-white/80 p-6">
                    <h3 className="text-sm font-semibold text-slate-700">指摘一覧</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {state.result.inlineIssues.map((issue, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${issueSeverityClass[issue.severity]}`}>
                              {issue.category}
                            </span>
                            <span className="text-xs text-slate-500">
                              {issue.startIndex} - {issue.endIndex}
                            </span>
                          </div>
                          <p className="mt-3 font-semibold text-slate-800">{issue.message}</p>
                          <p className="mt-1 text-xs text-slate-600">{issue.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
