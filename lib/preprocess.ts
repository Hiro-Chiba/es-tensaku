import { z } from "zod";
import type { EssayInput, PreprocessResult } from "@/lib/types";

const bannedWordList = ["fuck", "shit", "damn"];

const essaySchema = z.object({
  content: z
    .string()
    .min(50, "エッセイは50語以上で入力してください。")
    .max(4000, "エッセイは4000語以内で入力してください。"),
  topic: z
    .string()
    .max(120, "トピックは120文字以内で入力してください。")
    .optional(),
  settings: z.object({
    focus: z.enum(["general", "academic", "exam"]),
    targetWordCount: z
      .number()
      .int()
      .positive()
      .max(4000)
      .optional(),
    tone: z.string().max(80).optional()
  }),
  agreeToTerms: z.literal(true, {
    errorMap: () => ({ message: "利用規約に同意してください。" })
  })
});

const bannedWordRegex = new RegExp(`\\b(${bannedWordList.join("|")})\\b`, "gi");

function detectLanguage(text: string): "en" | "unknown" {
  const asciiRatio = text.split("").filter((c) => /[A-Za-z\s\p{P}]/u.test(c)).length / text.length;
  return asciiRatio > 0.7 ? "en" : "unknown";
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function findBannedWords(text: string): string[] {
  const matches = text.match(bannedWordRegex);
  if (!matches) return [];
  return Array.from(new Set(matches.map((word) => word.toLowerCase())));
}

export function validateEssayInput(input: EssayInput): EssayInput {
  return essaySchema.parse(input);
}

export function preprocessEssay(input: EssayInput): PreprocessResult {
  const validated = validateEssayInput(input);
  return {
    wordCount: countWords(validated.content),
    language: detectLanguage(validated.content),
    bannedWords: findBannedWords(validated.content)
  };
}
