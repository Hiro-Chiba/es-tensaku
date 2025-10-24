import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import { preprocessEssay } from "@/lib/preprocess";
import { canProceed } from "@/lib/rateLimiter";
import { GeminiService } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError
} from "@prisma/client/runtime/library";
import type {
  EssayInput,
  GeminiReviewInput,
  GeminiReviewOutput,
  ReviewStreamEvent
} from "@/lib/types";

const encoder = new TextEncoder();

function streamEvent(controller: ReadableStreamDefaultController, event: ReviewStreamEvent) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

function isPersistenceSetupError(error: unknown): boolean {
  if (error instanceof PrismaClientKnownRequestError) {
    return error.code === "P2021";
  }
  return error instanceof PrismaClientInitializationError;
}

function getClientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = (request as unknown as { ip?: string }).ip;
  return realIp ?? "unknown";
}

export async function POST(request: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = (await request.json()) as EssayInput;
        const clientKey = getClientKey(request);
        if (!canProceed(clientKey)) {
          streamEvent(controller, {
            type: "error",
            message: "短時間にリクエストが集中しています。しばらく待ってから再度お試しください。"
          });
          controller.close();
          return;
        }

        const preprocess = preprocessEssay(body);
        streamEvent(controller, { type: "preprocess", payload: preprocess });

        const cookieStore = cookies();
        let sessionKey = cookieStore.get("es-session")?.value;
        if (!sessionKey) {
          sessionKey = nanoid();
          cookieStore.set("es-session", sessionKey, {
            httpOnly: true,
            secure: true,
            path: "/",
            maxAge: 60 * 60 * 24 * 30
          });
        }

        let session: { id: string } | null = null;
        let canPersist = true;
        let persistenceWarningSent = false;

        const notifyPersistenceIssue = (error: unknown) => {
          if (persistenceWarningSent) return;
          persistenceWarningSent = true;
          console.warn("Skipping persistence because the database is not ready.", error);
          streamEvent(controller, {
            type: "warning",
            message: "データベースが初期化されていないため履歴保存をスキップしました。"
          });
        };

        try {
          session = await prisma.reviewSession.upsert({
            where: { sessionKey },
            update: {},
            create: { sessionKey }
          });
        } catch (error) {
          if (isPersistenceSetupError(error)) {
            canPersist = false;
            notifyPersistenceIssue(error);
          } else {
            throw error;
          }
        }

        const gemini = new GeminiService(process.env.GEMINI_API_KEY ?? "");
        const geminiInput: GeminiReviewInput = {
          essay: body,
          preprocess
        };

        streamEvent(controller, { type: "gemini-requested" });
        const result: GeminiReviewOutput = await gemini.generateReview(geminiInput);

        let persisted = false;
        if (canPersist && session) {
          try {
            const essayRecord = await prisma.essay.create({
              data: {
                sessionId: session.id,
                topic: body.topic,
                content: body.content,
                characterCount: preprocess.characterCount
              }
            });

            const evaluation = await prisma.evaluation.create({
              data: {
                essayId: essayRecord.id,
                overallScore: result.overallScore,
                sectionScores: {
                  content: result.sectionScores.content,
                  organisation: result.sectionScores.organisation,
                  language: result.sectionScores.language,
                  mechanics: result.sectionScores.mechanics
                } satisfies Prisma.InputJsonObject,
                summaryMarkdown: result.summaryMarkdown,
                rewriteSuggestion: result.rewriteSuggestion,
                learningTasks: result.learningTasks,
                confidence: result.confidence
              }
            });

            if (result.inlineIssues.length > 0) {
              await prisma.inlineIssue.createMany({
                data: result.inlineIssues.map((issue) => ({
                  evaluationId: evaluation.id,
                  startIndex: issue.startIndex,
                  endIndex: issue.endIndex,
                  category: issue.category,
                  severity: issue.severity,
                  message: issue.message,
                  suggestion: issue.suggestion
                }))
              });
            }

            if (result.tokenUsage.length > 0) {
              await prisma.tokenUsageLog.createMany({
                data: result.tokenUsage.map((usage) => ({
                  evaluationId: evaluation.id,
                  mode: usage.mode,
                  promptTokens: usage.promptTokens,
                  responseTokens: usage.responseTokens,
                  latencyMs: usage.latencyMs
                }))
              });
            }

            persisted = true;
          } catch (error) {
            if (isPersistenceSetupError(error)) {
              canPersist = false;
              notifyPersistenceIssue(error);
            } else {
              throw error;
            }
          }
        }

        if (persisted) {
          streamEvent(controller, { type: "persisted" });
        }
        streamEvent(controller, { type: "completed", payload: result });
        controller.close();
      } catch (error) {
        console.error(error);
        streamEvent(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "不明なエラーが発生しました"
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
