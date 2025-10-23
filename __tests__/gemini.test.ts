import { GeminiService } from "@/lib/gemini";
import type { GeminiReviewInput } from "@/lib/types";

describe("GeminiService", () => {
  const input: GeminiReviewInput = {
    essay: {
      content:
        "私は大学で地域課題を解決するためのプロジェクトを主導し、関係者の意見を丁寧に調整しながら成果につなげました。" +
        "具体的には、参加者の声を集めて改善案をまとめ、議論の整理と役割分担の見直しを行い、前年よりも満足度を高めました。" +
        "この経験で培った調整力と改善力を活かし、御社の新規事業開発でも信頼される人材として貢献したいと考えています。",
      settings: {
        focus: "motivation",
        tone: "丁寧"
      },
      agreeToTerms: true
    },
    preprocess: {
      language: "ja",
      characterCount: 210,
      bannedWords: []
    }
  };

  it("parses structured response", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    overallScore: 88,
                    summaryMarkdown: "**Great job**",
                    sectionScores: { content: 22, organisation: 22, language: 22, mechanics: 22 },
                    topImprovementPoints: ["Idea", "Structure", "Grammar"],
                    inlineIssues: [],
                    rewriteSuggestion: "Rewrite suggestion",
                    learningTasks: ["Task1", "Task2"],
                    confidence: 0.92
                  })
                }
              ]
            }
          }
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 }
      })
    });

    const service = new GeminiService("test-key", fetchMock);
    const result = await service.generateReview(input);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("key=test-key"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result.overallScore).toBe(88);
    expect(result.tokenUsage[0].promptTokens).toBe(10);
  });

  it("throws when response is invalid", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] })
    });
    const service = new GeminiService("test-key", fetchMock);
    await expect(service.generateReview(input)).rejects.toThrow("Gemini API から有効な応答が得られませんでした。");
  });
});
