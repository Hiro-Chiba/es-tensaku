export type ReviewFocus = "general" | "academic" | "exam";

export interface ReviewSettings {
  focus: ReviewFocus;
  targetWordCount?: number;
  tone?: string;
}

export interface EssayInput {
  content: string;
  topic?: string;
  settings: ReviewSettings;
  agreeToTerms: boolean;
}

export interface PreprocessResult {
  wordCount: number;
  language: "en" | "unknown";
  bannedWords: string[];
}

export interface GeminiReviewInput {
  essay: EssayInput;
  preprocess: PreprocessResult;
}

export interface SectionScore {
  content: number;
  organisation: number;
  language: number;
  mechanics: number;
}

export interface InlineIssue {
  startIndex: number;
  endIndex: number;
  category: string;
  severity: "info" | "minor" | "major";
  message: string;
  suggestion: string;
}

export interface GeminiReviewOutput {
  overallScore: number;
  summaryMarkdown: string;
  sectionScores: SectionScore;
  topImprovementPoints: string[];
  inlineIssues: InlineIssue[];
  rewriteSuggestion: string;
  learningTasks: string[];
  confidence: number;
  tokenUsage: {
    promptTokens: number;
    responseTokens: number;
    mode: "evaluation" | "rewrite";
    latencyMs: number;
  }[];
}

export interface ReviewRecord {
  id: string;
  essay: EssayInput;
  result: GeminiReviewOutput;
  createdAt: string;
}

export type ReviewStreamEventType =
  | "preprocess"
  | "gemini-requested"
  | "persisted"
  | "completed"
  | "error";

export interface ReviewStreamEvent {
  type: ReviewStreamEventType;
  payload?: unknown;
  message?: string;
}
