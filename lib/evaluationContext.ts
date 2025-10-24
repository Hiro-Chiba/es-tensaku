import type { ReviewFocus } from "@/lib/types";

interface SentenceInfo {
  text: string;
  ending: string;
  length: number;
  commaCount: number;
  isKeigo: boolean;
  isPlain: boolean;
}

export interface EvaluationContext {
  text: string;
  normalized: string;
  focus: ReviewFocus;
  topic?: string;
  targetCharacterCount?: number;
  industry?: string;
  jobCategory?: string;
  charCount: number;
  wordCount: number;
  uniqueWordRatio: number;
  targetCoverage?: number;
  paragraphs: string[];
  sentences: string[];
  sentenceInfos: SentenceInfo[];
  firstSentence: string;
  lastSentence: string;
  uniqueSentenceRatio: number;
  endingVariety: number;
  keigoRatio: number;
  plainRatio: number;
  averageSentenceLength: number;
  maxSentenceLength: number;
  punctuationPerSentence: number;
  indentRatio: number;
  bannedExpressions: string[];
  colloquialExpressions: string[];
  selfDeprecatingExpressions: string[];
  positiveWordCount: number;
  negativeWordCount: number;
  actionVerbCount: number;
  emotionalWordCount: number;
  connectorCount: number;
  causeEffectConnectorCount: number;
  paragraphBalance: number;
  blankLineCount: number;
  numericCount: number;
  timeExpressionCount: number;
  abstractKeywordCount: number;
  concreteKeywordCount: number;
  reflectionCount: number;
  futureCount: number;
  gratitudeCount: number;
  socialImpactCount: number;
  themeKeywordCoverage: number;
  focusKeywords: string[];
}

const bannedPhrases = [
  "御社の雰囲気が良いと感じた",
  "社会貢献がしたい",
  "成長できる環境だと思った",
  "幅広い業務に携われる"
];

const colloquialWords = [
  "めっちゃ",
  "すごく",
  "やばい",
  "マジ",
  "とか",
  "ほんと",
  "ヤバい",
  "すげー"
];

const selfDeprecatingWords = [
  "自信がない",
  "至らない点ばかり",
  "あまり得意ではない",
  "できない人間"
];

const emotionalWords = ["悔しかった", "嬉しかった", "悲しかった", "ショックだった"];

const positiveWords = [
  "実現",
  "貢献",
  "価値",
  "成長",
  "改善",
  "向上",
  "支援",
  "挑戦",
  "創出",
  "強化"
];

const negativeWords = ["できなかった", "失敗", "課題が残る", "反省", "問題があった"];

const actionVerbs = [
  "分析",
  "計画",
  "実行",
  "改善",
  "提案",
  "設計",
  "検証",
  "調整",
  "交渉",
  "推進"
];

const abstractKeywords = [
  "理念",
  "価値観",
  "方針",
  "戦略",
  "ビジョン",
  "使命",
  "価値",
  "目的",
  "志向",
  "方向性"
];

const concreteKeywords = [
  "具体",
  "指標",
  "数値",
  "結果",
  "成果",
  "データ",
  "行動",
  "プロセス"
];

const reflectionKeywords = ["反省", "課題", "振り返", "改善点"];
const futureKeywords = ["今後", "入社後", "将来", "これから", "中長期", "先々"];
const gratitudeKeywords = ["評価", "感謝", "信頼", "称賛", "高く評価"];
const socialKeywords = ["社会", "顧客", "利用者", "チーム", "組織", "地域", "仲間"];

function normalizeText(text: string): string {
  return text.replace(/\r/g, "").trim();
}

function splitParagraphs(text: string): string[] {
  return normalizeText(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function splitSentences(text: string): string[] {
  const cleaned = normalizeText(text);
  const sentences = cleaned
    .split(/(?<=[。！？\?！])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  if (sentences.length === 0 && cleaned) {
    return [cleaned];
  }
  return sentences;
}

function buildSentenceInfos(sentences: string[]): SentenceInfo[] {
  return sentences.map((sentence) => {
    const endingMatch = sentence.match(/(.{1,3})$/u);
    const ending = endingMatch ? endingMatch[0] : sentence;
    const length = sentence.replace(/\s+/g, "").length;
    const commaCount = (sentence.match(/、/g) ?? []).length;
    const isKeigo = /です$|ます$|でした$|ました$|いたします$|しております$|いたしました$/u.test(sentence);
    const isPlain = /だ$|である$|する$|した$|と考える$|と思う$/u.test(sentence);
    return {
      text: sentence,
      ending,
      length,
      commaCount,
      isKeigo,
      isPlain
    } satisfies SentenceInfo;
  });
}

function countMatches(text: string, words: string[]): number {
  const normalized = normalizeText(text);
  return words.reduce((total, word) => {
    const regex = new RegExp(word, "g");
    return total + (normalized.match(regex) ?? []).length;
  }, 0);
}

function paragraphBalance(paragraphs: string[]): number {
  if (paragraphs.length <= 1) return 1;
  const lengths = paragraphs.map((paragraph) => paragraph.replace(/\s+/g, "").length);
  const max = Math.max(...lengths);
  const min = Math.min(...lengths);
  if (max === 0) return 1;
  return min / max;
}

function tokenize(text: string): string[] {
  return text
    .replace(/[「」『』（）()［］【】〈〉《》]/g, " ")
    .split(/[\s、。,.!？!・\-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function paragraphsContaining(paragraphs: string[], keywords: string[]): number {
  return paragraphs.filter((paragraph) => keywords.some((keyword) => paragraph.includes(keyword))).length;
}

const focusKeywordsMap: Record<ReviewFocus, string[]> = {
  motivation: ["志望", "理由", "貴社", "業界", "入社後"],
  gakuchika: ["取り組", "活動", "課題", "学び", "結果"],
  selfPr: ["強み", "活か", "価値", "貢献", "経験"]
};

export interface EvaluationContextOptions {
  topic?: string;
  targetCharacterCount?: number;
  industry?: string;
  jobCategory?: string;
}

export function buildEvaluationContext(
  text: string,
  focus: ReviewFocus,
  options?: EvaluationContextOptions
): EvaluationContext {
  const normalized = normalizeText(text);
  const paragraphs = splitParagraphs(normalized);
  const sentences = splitSentences(normalized);
  const sentenceInfos = buildSentenceInfos(sentences);
  const charCount = normalized.replace(/\s+/g, "").length;
  const tokens = tokenize(normalized);
  const uniqueTokens = new Set(tokens);
  const focusKeywords = focusKeywordsMap[focus];
  const themeCoverageCount = paragraphsContaining(paragraphs, focusKeywords);

  const wordCount = tokens.length;
  const uniqueWordRatio = wordCount === 0 ? 1 : uniqueTokens.size / wordCount;
  const targetCoverage = options?.targetCharacterCount
    ? charCount / options.targetCharacterCount
    : undefined;
  const averageSentenceLength = sentences.length === 0
    ? 0
    : sentenceInfos.reduce((sum, info) => sum + info.length, 0) / sentences.length;
  const uniqueSentences = new Set(sentences);
  const endings = new Set(sentenceInfos.map((info) => info.ending));

  const bannedExpressionsFound = bannedPhrases.filter((phrase) => normalized.includes(phrase));
  const colloquialFound = colloquialWords.filter((phrase) => normalized.includes(phrase));
  const selfDeprecatingFound = selfDeprecatingWords.filter((phrase) => normalized.includes(phrase));
  const positiveCount = countMatches(normalized, positiveWords);
  const negativeCount = countMatches(normalized, negativeWords);
  const actionVerbCount = countMatches(normalized, actionVerbs);
  const emotionalCount = countMatches(normalized, emotionalWords);
  const connectorRegex = /(ため|ので|したがって|このため|その結果|一方|結果的に|そこで|まず|次に|さらに|最後に|ゆえに|だから|したことで)/g;
  const connectors = normalized.match(connectorRegex) ?? [];
  const causeEffectConnectors = normalized.match(/(ため|ので|したがって|このため|その結果|ゆえに|だから)/g) ?? [];
  const numericCount = (normalized.match(/[0-9０-９]+/g) ?? []).length;
  const timeExpressionCount = (normalized.match(/[0-9０-９]{1,2}(?:年|ヶ月|か月|月|週間|日)/g) ?? []).length;
  const blankLineCount = (normalized.match(/\n\s*\n/g) ?? []).length;

  const abstractKeywordCount = countMatches(normalized, abstractKeywords);
  const concreteKeywordCount = countMatches(normalized, concreteKeywords) + numericCount + timeExpressionCount;
  const reflectionCount = countMatches(normalized, reflectionKeywords);
  const futureCount = countMatches(normalized, futureKeywords);
  const gratitudeCount = countMatches(normalized, gratitudeKeywords);
  const socialImpactCount = countMatches(normalized, socialKeywords);

  return {
    text,
    normalized,
    focus,
    topic: options?.topic,
    targetCharacterCount: options?.targetCharacterCount,
    industry: options?.industry,
    jobCategory: options?.jobCategory,
    charCount,
    wordCount,
    uniqueWordRatio,
    targetCoverage,
    paragraphs,
    sentences,
    sentenceInfos,
    firstSentence: sentences[0] ?? "",
    lastSentence: sentences[sentences.length - 1] ?? "",
    uniqueSentenceRatio: sentences.length === 0 ? 1 : uniqueSentences.size / sentences.length,
    endingVariety: endings.size,
    keigoRatio: sentenceInfos.length === 0
      ? 1
      : sentenceInfos.filter((info) => info.isKeigo).length / sentenceInfos.length,
    plainRatio: sentenceInfos.length === 0
      ? 0
      : sentenceInfos.filter((info) => info.isPlain).length / sentenceInfos.length,
    averageSentenceLength,
    maxSentenceLength: sentenceInfos.reduce((max, info) => Math.max(max, info.length), 0),
    punctuationPerSentence: sentenceInfos.length === 0
      ? 0
      : sentenceInfos.reduce((sum, info) => sum + info.commaCount, 0) / sentenceInfos.length,
    indentRatio: paragraphs.length === 0
      ? 1
      : paragraphs.filter((paragraph) => /^　/.test(paragraph)).length / paragraphs.length,
    bannedExpressions: bannedExpressionsFound,
    colloquialExpressions: colloquialFound,
    selfDeprecatingExpressions: selfDeprecatingFound,
    positiveWordCount: positiveCount,
    negativeWordCount: negativeCount,
    actionVerbCount,
    emotionalWordCount: emotionalCount,
    connectorCount: connectors.length,
    causeEffectConnectorCount: causeEffectConnectors.length,
    paragraphBalance: paragraphBalance(paragraphs),
    blankLineCount,
    numericCount,
    timeExpressionCount,
    abstractKeywordCount,
    concreteKeywordCount,
    reflectionCount,
    futureCount,
    gratitudeCount,
    socialImpactCount,
    themeKeywordCoverage: paragraphs.length === 0 ? 0 : themeCoverageCount / paragraphs.length,
    focusKeywords
  } satisfies EvaluationContext;
}

