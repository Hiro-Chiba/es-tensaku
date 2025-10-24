export type ReviewFocus = "motivation" | "gakuchika" | "selfPr";

export interface ReviewSettings {
  focus: ReviewFocus;
  targetCharacterCount?: number;
  industry?: string;
  jobCategory?: string;
}

export interface EssayInput {
  content: string;
  topic?: string;
  settings: ReviewSettings;
}

export interface PreprocessResult {
  characterCount: number;
  language: "ja" | "en" | "unknown";
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

export interface EssayCheckResult {
  id: string;
  label: string;
  group: string;
  description: string;
  weight: number;
  passed: boolean;
  advice: string;
  rubricId?: number;
  tags?: string[];
}

export interface EssayEvaluation {
  score: number;
  rawScore: number;
  maxScore: number;
  checks: EssayCheckResult[];
  groupSummaries: Array<{ group: string; score: number; maxScore: number; percentage: number }>;
  topAdvice: string[];
  actionPlan: ActionPlanItem[];
  coverage: RubricCoverageSummary;
}

export interface EssayImprovement {
  text: string;
  summary: string;
  appliedStrategies: string[];
  actionPlan?: ActionPlanItem[];
}

export interface ActionPlanItem {
  title: string;
  summary: string;
  rubricIds: number[];
  suggestions: string[];
  priority: "high" | "medium" | "low";
}

export interface RubricCoverageSummary {
  totalCriteria: number;
  satisfied: number;
  percentage: number;
  groups: Array<{ group: string; satisfied: number; total: number; percentage: number }>;
}

export interface EvaluationOptions {
  topic?: string;
  targetCharacterCount?: number;
  industry?: string;
  jobCategory?: string;
}

export type ReviewStreamEventType =
  | "preprocess"
  | "gemini-requested"
  | "persisted"
  | "completed"
  | "warning"
  | "error";

export interface ReviewStreamEvent {
  type: ReviewStreamEventType;
  payload?: unknown;
  message?: string;
}
