import { preprocessEssay } from "@/lib/preprocess";
import type { EssayInput } from "@/lib/types";

describe("preprocessEssay", () => {
  const baseEssay: EssayInput = {
    content:
      Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ') +
      ' damn highlight for banned word detection',
    topic: "Test essay",
    settings: {
      focus: "general"
    },
    agreeToTerms: true
  };

  it("calculates word count and language", () => {
    const result = preprocessEssay(baseEssay);
    expect(result.wordCount).toBeGreaterThanOrEqual(50);
    expect(result.language).toBe("en");
  });

  it("flags banned words", () => {
    const result = preprocessEssay(baseEssay);
    expect(result.bannedWords).toContain("damn");
  });

  it("throws when essay is too short", () => {
    const essay: EssayInput = {
      ...baseEssay,
      content: "Too short essay",
      agreeToTerms: true
    };
    expect(() => preprocessEssay(essay)).toThrow("エッセイは50語以上で入力してください。");
  });
});
