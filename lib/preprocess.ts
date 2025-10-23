import { z } from "zod";
import type { EssayInput, PreprocessResult } from "@/lib/types";

const bannedWordList = ["死ね", "殺す", "バカ", "fuck", "shit", "damn"];

const focusEnum = z.enum(["motivation", "gakuchika", "selfPr"] as const);

const essaySchema = z.object({
  content: z
    .string()
    .min(200, "エントリーシートは200文字以上で入力してください。")
    .max(2000, "エントリーシートは2000文字以内で入力してください。"),
  topic: z
    .string()
    .max(120, "トピックは120文字以内で入力してください。")
    .optional(),
  settings: z.object({
    focus: focusEnum,
    targetCharacterCount: z
      .number()
      .int()
      .positive()
      .max(2000)
      .optional(),
    tone: z.string().max(80).optional()
  }),
  agreeToTerms: z.literal(true, {
    errorMap: () => ({ message: "利用規約に同意してください。" })
  })
});

const bannedWordRegex = new RegExp(
  `(${bannedWordList.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  "gi"
);

function detectLanguage(text: string): "ja" | "en" | "unknown" {
  const total = text.length || 1;
  const asciiCount = text.split("").filter((c) => /[A-Za-z\s\p{P}]/u.test(c)).length;
  const japaneseCount = text.split("").filter((c) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c)).length;
  if (japaneseCount / total > 0.3) {
    return "ja";
  }
  if (asciiCount / total > 0.7) {
    return "en";
  }
  return "unknown";
}

function countCharacters(text: string): number {
  return text.replace(/\s+/g, "").length;
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
    characterCount: countCharacters(validated.content),
    language: detectLanguage(validated.content),
    bannedWords: findBannedWords(validated.content)
  };
}
