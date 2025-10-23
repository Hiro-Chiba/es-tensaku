import { GeminiService } from "@/lib/gemini";
import type { GeminiReviewInput } from "@/lib/types";

describe("GeminiService", () => {
  const input: GeminiReviewInput = {
    essay: {
      content:
        "This essay contains a sufficient number of words to pass the validation layer and should be analysed by the service.",
      settings: {
        focus: "academic",
        tone: "formal"
      },
      agreeToTerms: true
    },
    preprocess: {
      language: "en",
      wordCount: 30,
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
