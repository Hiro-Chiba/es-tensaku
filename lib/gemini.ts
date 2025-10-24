import type {
  GeminiReviewInput,
  GeminiReviewOutput,
  InlineIssue
} from "@/lib/types";

const focusLabels: Record<GeminiReviewInput["essay"]["settings"]["focus"], string> = {
  motivation: "志望動機",
  gakuchika: "学生時代に頑張ったこと",
  selfPr: "自己PR"
};

type Fetcher = typeof fetch;

interface GeminiContentPart {
  text?: string;
}

interface GeminiContent {
  role: "user" | "model" | "system";
  parts: GeminiContentPart[];
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GeminiService {
  private readonly apiKey: string;
  private readonly fetcher: Fetcher;
  private readonly endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  constructor(apiKey: string, fetcher: Fetcher = fetch) {
    if (!apiKey) {
      throw new Error("Gemini API キーが設定されていません。");
    }
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async generateReview(input: GeminiReviewInput): Promise<GeminiReviewOutput> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(input);
    const response = await this.fetcher(`${this.endpoint}?key=${this.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [systemPrompt, userPrompt],
        generationConfig: {
          temperature: 0.5,
          topP: 0.95,
          topK: 40,
          candidateCount: 1
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API 呼び出しに失敗しました: ${text}`);
    }

    const json = (await response.json()) as GeminiResponse;
    const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("Gemini API から有効な応答が得られませんでした。");
    }

    const parsed = this.parseModelResponse(candidateText);
    const usageMetadata = json.usageMetadata ?? {};
    return {
      ...parsed,
      tokenUsage: [
        {
          mode: "evaluation",
          promptTokens: usageMetadata.promptTokenCount ?? 0,
          responseTokens: usageMetadata.candidatesTokenCount ?? 0,
          latencyMs: 0
        }
      ]
    };
  }

  private buildSystemPrompt(): GeminiContent {
    return {
      role: "system",
      parts: [
        {
          text: [
            "You are an experienced career advisor who reviews Japanese job application entry sheets.",
            "Assess submissions written in Japanese with emphasis on motivation clarity, logical structure, persuasive power, and appropriateness for corporate communication.",
            "Return constructive, culturally aware guidance and keep the tone supportive.",
            "Respond in Japanese and output JSON matching the schema provided in the prompt."
          ].join(" ")
        }
      ]
    };
  }

  private buildUserPrompt(input: GeminiReviewInput): GeminiContent {
    const { essay, preprocess } = input;
    const focusLabel = focusLabels[essay.settings.focus];
    const settingsSummary = [
      `Review focus: ${focusLabel}`,
      essay.settings.targetCharacterCount
        ? `Target characters: ${essay.settings.targetCharacterCount}`
        : null
    ]
      .filter(Boolean)
      .join(" | ");

    const preprocessingSummary = [
      `Detected language: ${preprocess.language}`,
      `Character count: ${preprocess.characterCount}`,
      preprocess.bannedWords.length > 0
        ? `Banned words flagged: ${preprocess.bannedWords.join(", ")}`
        : "Banned words flagged: none"
    ].join(" | ");

    const schemaDescription = `
Return a JSON object with the following shape:
{
  "overallScore": number (0-100),
  "summaryMarkdown": string,
  "sectionScores": {
    "content": number,
    "organisation": number,
    "language": number,
    "mechanics": number
  },
  "topImprovementPoints": string[3],
  "inlineIssues": Array<{ "startIndex": number, "endIndex": number, "category": string, "severity": "info" | "minor" | "major", "message": string, "suggestion": string }>,
  "rewriteSuggestion": string,
  "learningTasks": string[2],
  "confidence": number (0-1)
}
Ensure all text fields (summaryMarkdown, topImprovementPoints, inlineIssues, rewriteSuggestion, learningTasks) are written in natural Japanese suitable for job application feedback.`;

    const prompt = `Document focus: ${focusLabel}
Topic or target company: ${essay.topic ?? "(not provided)"}
Settings: ${settingsSummary}
Preprocessing summary: ${preprocessingSummary}
Entry sheet response (Japanese):
"""
${essay.content}
"""
Provide thorough feedback in Japanese tailored for entry sheets submitted to Japanese companies.`;

    return {
      role: "user",
      parts: [
        { text: schemaDescription },
        { text: prompt }
      ]
    };
  }

  private parseModelResponse(text: string): GeminiReviewOutput {
    try {
      const jsonStart = text.indexOf("{");
      const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text;
      const parsed = JSON.parse(jsonText) as GeminiReviewOutput;
      return {
        ...parsed,
        inlineIssues: (parsed.inlineIssues ?? []).map((issue: InlineIssue) => ({
          ...issue,
          severity: issue.severity ?? "minor"
        }))
      };
    } catch (error) {
      throw new Error("Gemini API 応答の JSON 解析に失敗しました。");
    }
  }
}
