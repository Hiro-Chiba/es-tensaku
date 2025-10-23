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
  GeminiReviewOutput,
  ReviewStreamEvent,
  ReviewStreamEventType
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface ReviewState {
  status: "idle" | "running" | "error";
  message?: string;
  result?: GeminiReviewOutput;
}

const focusOptions = [
  { value: "general", label: "General" },
  { value: "academic", label: "Academic" },
  { value: "exam", label: "Exam" }
] as const;

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
  const [focus, setFocus] = useState<typeof focusOptions[number]["value"]>("general");
  const [targetWordCount, setTargetWordCount] = useState<number | undefined>();
  const [tone, setTone] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [state, setState] = useState<ReviewState>({ status: "idle" });
  const [events, setEvents] = useState<ReviewStreamEventType[]>([]);

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

  const handleSubmit = useCallback(async () => {
    if (!agreeToTerms) {
      toast.error("利用規約に同意してください");
      setState({ status: "error", message: "利用規約に同意してください" });
      return;
    }
    const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 50) {
      const message = "エッセイは最低50語以上入力してください";
      toast.error(message);
      setState({ status: "error", message });
      return;
    }
    setState({ status: "running" });
    setEvents([]);
    const payload: EssayInput = {
      content: essay,
      topic: topic || undefined,
      settings: {
        focus,
        targetWordCount,
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
  }, [agreeToTerms, essay, focus, saveRecord, targetWordCount, tone, topic]);

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
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2 text-center">
        <Badge variant="success">Gemini 2.5 Flash powered</Badge>
        <h1 className="text-4xl font-bold tracking-tight">ES-tensaku</h1>
        <p className="text-slate-600">
          英作文を貼り付けて、数十秒でCEFR指標に基づくプロレベルのフィードバックを受け取りましょう。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>エッセイを入力</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">トピック (任意)</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="例: The impact of remote work on productivity"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">評価観点</label>
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
              <label className="text-sm font-medium">目標語数 (任意)</label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="例: 250"
                value={targetWordCount ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setTargetWordCount(value ? Number(value) : undefined);
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">トーン (任意)</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="例: Formal, persuasive"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">エッセイ本文</label>
            <textarea
              rows={12}
              value={essay}
              onChange={(event) => setEssay(event.target.value)}
              placeholder="ここに英作文を貼り付けてください。Markdown も利用できます。"
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
              {state.status === "running" ? "添削中..." : "Gemini に送信"}
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

      {state.result && (
        <Card>
          <CardHeader>
            <CardTitle>添削結果</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-xl font-semibold">総合スコア</h2>
              <p className="text-4xl font-bold">{state.result.overallScore}</p>
              <div className="space-y-2">
                {Object.entries(state.result.sectionScores).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{key}</span>
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
                    <Badge>{record.essay.settings.focus}</Badge>
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
    </main>
  );
}
