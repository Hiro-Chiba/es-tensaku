import type {
  ActionPlanItem,
  EssayCheckResult,
  EssayEvaluation,
  EssayImprovement,
  EvaluationOptions,
  ReviewFocus,
  RubricCoverageSummary
} from "@/lib/types";
import {
  buildEvaluationContext,
  splitSentences,
  type EvaluationContextOptions
} from "@/lib/evaluationContext";
import { getApplicableCriteria } from "@/lib/rubric";

interface TemplateOptions {
  topic?: string;
  useOriginalSnippets: boolean;
}

interface ImprovementOptions extends EvaluationOptions {
  evaluation?: EssayEvaluation;
  forceStructured?: boolean;
}

function toContextOptions(options?: EvaluationOptions): EvaluationContextOptions | undefined {
  if (!options) return undefined;
  return {
    topic: options.topic,
    targetCharacterCount: options.targetCharacterCount,
    tonePreference: options.tone,
    industry: options.industry,
    jobCategory: options.jobCategory
  } satisfies EvaluationContextOptions;
}

function buildCoverageSummary(results: EssayCheckResult[]): RubricCoverageSummary {
  const total = results.length;
  const satisfied = results.filter((result) => result.passed).length;
  const groups = new Map<string, { satisfied: number; total: number }>();
  for (const result of results) {
    const current = groups.get(result.group) ?? { satisfied: 0, total: 0 };
    current.total += 1;
    if (result.passed) {
      current.satisfied += 1;
    }
    groups.set(result.group, current);
  }

  const groupSummaries = Array.from(groups.entries()).map(([group, summary]) => ({
    group,
    satisfied: summary.satisfied,
    total: summary.total,
    percentage: summary.total === 0 ? 0 : Math.round((summary.satisfied / summary.total) * 100)
  }));

  return {
    totalCriteria: total,
    satisfied,
    percentage: total === 0 ? 0 : Math.round((satisfied / total) * 100),
    groups: groupSummaries
  } satisfies RubricCoverageSummary;
}

function determinePriority(index: number, totalWeight: number): ActionPlanItem["priority"] {
  if (index === 0 || totalWeight >= 6) return "high";
  if (totalWeight >= 3) return "medium";
  return "low";
}

function buildActionPlan(results: EssayCheckResult[]): ActionPlanItem[] {
  const failed = results.filter((result) => !result.passed);
  if (failed.length === 0) {
    return [];
  }

  const grouped = new Map<string, { weight: number; items: EssayCheckResult[] }>();
  for (const result of failed) {
    const current = grouped.get(result.group) ?? { weight: 0, items: [] };
    current.weight += result.weight;
    current.items.push(result);
    grouped.set(result.group, current);
  }

  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => b[1].weight - a[1].weight);

  return sortedGroups.slice(0, 3).map(([group, data], index) => {
    const rubricIds = data.items
      .map((item) => item.rubricId)
      .filter((id): id is number => typeof id === "number");
    const topLabels = data.items.map((item) => item.label).slice(0, 3).join("・");
    const suggestions = data.items
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((item) => item.advice);
    return {
      title: group,
      summary: `${topLabels || group}を重点的に磨くことで、全体の完成度を底上げできます。`,
      rubricIds,
      suggestions,
      priority: determinePriority(index, data.weight)
    } satisfies ActionPlanItem;
  });
}

export function evaluateEssay(
  text: string,
  focus: ReviewFocus,
  options?: EvaluationOptions
): EssayEvaluation {
  const contextOptions = toContextOptions(options);
  const context = buildEvaluationContext(text, focus, contextOptions);
  const criteria = getApplicableCriteria({
    focus,
    industry: options?.industry,
    jobCategory: options?.jobCategory
  });

  const results: EssayCheckResult[] = criteria.map((criterion) => {
    const passed = criterion.evaluate(context);
    return {
      id: criterion.id,
      label: criterion.label,
      group: criterion.group,
      description: criterion.description,
      weight: criterion.weight,
      passed,
      advice: criterion.advice,
      rubricId: criterion.rubricId,
      tags: criterion.tags
    } satisfies EssayCheckResult;
  });

  const maxScore = results.reduce((total, result) => total + result.weight, 0);
  const achievedScore = results
    .filter((result) => result.passed)
    .reduce((total, result) => total + result.weight, 0);
  const normalizedScore = maxScore === 0 ? 0 : Math.round((achievedScore / maxScore) * 100);

  const groupSummariesMap = new Map<string, { score: number; maxScore: number }>();
  for (const result of results) {
    const summary = groupSummariesMap.get(result.group) ?? { score: 0, maxScore: 0 };
    summary.maxScore += result.weight;
    if (result.passed) {
      summary.score += result.weight;
    }
    groupSummariesMap.set(result.group, summary);
  }

  const groupSummaries = Array.from(groupSummariesMap.entries()).map(([group, summary]) => ({
    group,
    score: summary.score,
    maxScore: summary.maxScore,
    percentage: summary.maxScore === 0 ? 0 : Math.round((summary.score / summary.maxScore) * 100)
  }));

  const topAdvice = results
    .filter((result) => !result.passed)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((result) => {
      const prefix = result.rubricId ? `#${result.rubricId} ` : "";
      return `${prefix}${result.label}: ${result.advice}`;
    });

  const coverage = buildCoverageSummary(results);
  const actionPlan = buildActionPlan(results);

  return {
    score: normalizedScore,
    rawScore: achievedScore,
    maxScore,
    checks: results,
    groupSummaries,
    topAdvice,
    actionPlan,
    coverage
  } satisfies EssayEvaluation;
}

function hasKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function sentencesContaining(sentences: string[], keywords: string[]): string[] {
  return sentences.filter((sentence) => hasKeywords(sentence, keywords));
}

function pickSentence(sentences: string[], keywords: string[]): string | undefined {
  return sentencesContaining(sentences, keywords)[0];
}

function ensureEndsWithPeriod(sentence: string): string {
  if (!sentence) return sentence;
  return /[。！？!？]$/.test(sentence) ? sentence : `${sentence}。`;
}

function stripEnding(sentence: string): string {
  return sentence.replace(/[。！？!？]+$/u, "");
}

function wrapParagraph(text: string): string {
  const trimmed = text.trim();
  return trimmed ? `　${trimmed}` : "";
}

function createSnippet(sentence?: string): string {
  if (!sentence) return "";
  const trimmed = stripEnding(sentence);
  if (!trimmed) return "";
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

function buildMotivationTemplate(
  sentences: string[],
  options: TemplateOptions
): { text: string; strategies: string[]; summary: string } {
  const topic = options.topic ? `「${options.topic}」` : "";
  const baseConclusion = options.useOriginalSnippets
    ? pickSentence(sentences, ["志望", "理由", "貴社", "動機"])
    : undefined;
  const conclusionCore = stripEnding(baseConclusion ?? "");
  const conclusion = ensureEndsWithPeriod(
    conclusionCore && conclusionCore.includes("貴社を志望する理由")
      ? conclusionCore
      : `貴社を志望する理由は、${topic ? `${topic}において` : ""}${conclusionCore || "社会課題の解決と価値創出を両立させている点"}に深く共感しているからです`
  );

  const industrySentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["業界", "社会", "市場", "課題"])
    : undefined;
  const companySentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["貴社", "理念", "価値観", "ビジョン", "強み"])
    : undefined;
  const roleSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["職種", "業務", "提案", "開発", "マーケティング"])
    : undefined;
  const experienceSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["経験", "活動", "取り組", "プロジェクト"])
    : undefined;

  const paragraphs = [
    wrapParagraph(conclusion),
    wrapParagraph(
      `まず、${stripEnding(industrySentence ?? "業界全体が転換期を迎えているいま")}という認識を持ち、長期的な市場の変化に応える専門性を磨いてきました。`
    ),
    wrapParagraph(
      `次に、${stripEnding(
        companySentence ?? "貴社が掲げる『社会課題の解決と事業成長の両立』という理念"
      )}に強く共感し、競合にはない価値提供の仕組みに魅力を感じています。`
    ),
    wrapParagraph(
      `さらに、志望する職種では${stripEnding(
        roleSentence ?? "顧客課題を深く理解し、最適な提案を組み立てる力"
      )}を活かし、顧客と社会の双方に貢献したいと考えています。`
    ),
    wrapParagraph(
      `${
        experienceSentence
          ? `ご入力いただいた文章でも触れられていた「${createSnippet(experienceSentence)}」という経験を軸に`
          : "学生時代に推進した課外プロジェクトを通じ"
      }、課題に粘り強く向き合い、周囲を巻き込みながら改善を進める力を培いました。`
    ),
    wrapParagraph(
      `入社後は、データに基づく分析と現場との対話を組み合わせ、顧客の成功体験を着実に積み上げるとともに、社会的意義の高い取り組みを主導します。`
    ),
    wrapParagraph(
      `中長期的には、ビジョンと整合した新規プロジェクトを牽引し、社会課題の解決につながるソリューションを創出してまいります。`
    )
  ].filter(Boolean);

  const strategies = [
    "業界→企業→職種の三段構成で志望理由を整理",
    "自身の経験と貢献イメージを接続",
    "社会的意義と将来ビジョンを明示"
  ];

  return {
    text: paragraphs.join("\n\n"),
    strategies,
    summary: "志望理由を業界・企業・職種の軸で再構築し、経験と貢献像を結び付けた改善案"
  };
}

function buildGakuchikaTemplate(
  sentences: string[],
  options: TemplateOptions
): { text: string; strategies: string[]; summary: string } {
  const activitySentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["取り組", "活動", "プロジェクト", "サークル"])
    : undefined;
  const challengeSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["課題", "壁", "問題", "苦労"])
    : undefined;
  const actionSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["工夫", "改善", "施策", "実行"])
    : undefined;
  const resultSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["成果", "結果", "評価", "数値"])
    : undefined;
  const learningSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["学び", "成長", "得た", "気づき"])
    : undefined;

  const paragraphs = [
    wrapParagraph(
      `${stripEnding(
        activitySentence ?? "学生時代に最も力を入れたのは、地域イベントの立て直しに挑戦したサークル活動"
      )}についてお伝えします。`
    ),
    wrapParagraph(
      `${stripEnding(challengeSentence ?? "参加者数が前年同期比で30％減少していたことを課題" )}と捉え、要因を洗い出すためにアンケートとヒアリングを実施しました。`
    ),
    wrapParagraph(
      `${stripEnding(
        actionSentence ?? "データ分析で特定したボトルネックごとに、告知チャネルの刷新と体験ブースの新設を提案"
      )}し、メンバーを巻き込みながら実行計画を策定しました。`
    ),
    wrapParagraph(
      `${stripEnding(
        resultSentence ?? "その結果、参加者数は前年同期比130％、満足度は92％まで改善"
      )}し、地域の方々からも高い評価をいただきました。`
    ),
    wrapParagraph(
      `${stripEnding(
        learningSentence ?? "この経験を通じて、課題を定量化し、関係者の納得感を得ながら改善を進める重要性"
      )}を学びました。`
    ),
    wrapParagraph(
      `今後は、この課題設定力と実行力を活かし、貴社のプロジェクトでも顧客価値の向上と組織変革を両立させていきます。`
    )
  ];

  const strategies = [
    "結論→背景→課題→行動→結果→学びの時系列整理",
    "数値目標と成果指標を明示",
    "学びを今後の貢献に接続"
  ];

  return {
    text: paragraphs.join("\n\n"),
    strategies,
    summary: "課題解決プロセスを定量的に描き、学びと再現性を明確化した改善案"
  };
}

function buildSelfPrTemplate(
  sentences: string[],
  options: TemplateOptions
): { text: string; strategies: string[]; summary: string } {
  const strengthSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["強み", "持ち味", "武器"])
    : undefined;
  const episodeSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["経験", "具体的", "エピソード", "実績"])
    : undefined;
  const improvementSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["改善", "課題", "弱み", "反省"])
    : undefined;
  const transferSentence = options.useOriginalSnippets
    ? pickSentence(sentences, ["活かす", "貢献", "仕事", "活用"])
    : undefined;

  const paragraphs = [
    wrapParagraph(
      `私の強みは${stripEnding(strengthSentence ?? "課題を定量化し、周囲を巻き込みながら解決に導く推進力")}です。`
    ),
    wrapParagraph(
      `${
        episodeSentence
          ? `例えば「${createSnippet(episodeSentence)}」という経験では`
          : "例えばゼミ活動での新規企画推進では"
      }、目的を共有するワークショップを開催し、行動計画を数字と期限で明確化することで実行力を高めました。`
    ),
    wrapParagraph(
      `その結果、参加率は計画比115％、売上は前年度比で1.4倍と大きく伸長し、関係者からも高い評価を得ました。`
    ),
    wrapParagraph(
      `この強みは、一度限りではなくインターンシップやボランティア活動でも発揮し、どの環境でも成果創出まで伴走する姿勢を貫いています。`
    ),
    wrapParagraph(
      `${stripEnding(
        improvementSentence ?? "一方で、スピードを優先し過ぎると周囲の意見を聞き漏らす課題"
      )}があるため、定期的な振り返りとメンバーとの対話の場を設けることでバランスを整えています。`
    ),
    wrapParagraph(
      `${stripEnding(
        transferSentence ?? "貴社でもデータと顧客の声を組み合わせた提案活動で価値提供"
      )}し、中長期的には新規事業の立ち上げにも挑戦したいと考えています。`
    )
  ];

  const strategies = [
    "強み→具体例→成果→再現性→弱点→活用の流れを明確化",
    "数値成果と改善アクションを記述",
    "入社後の活用イメージを具体化"
  ];

  return {
    text: paragraphs.join("\n\n"),
    strategies,
    summary: "強みを定義し具体例と再現性を示したうえで貢献イメージにつなげた改善案"
  };
}

export function createImprovedEssay(
  text: string,
  focus: ReviewFocus,
  options?: ImprovementOptions
): EssayImprovement {
  const sentences = splitSentences(text);
  const templateOptions: TemplateOptions = {
    topic: options?.topic,
    useOriginalSnippets: !options?.forceStructured
  };

  let base:
    | { text: string; strategies: string[]; summary: string }
    | undefined;

  if (focus === "motivation") {
    base = buildMotivationTemplate(sentences, templateOptions);
  } else if (focus === "gakuchika") {
    base = buildGakuchikaTemplate(sentences, templateOptions);
  } else {
    base = buildSelfPrTemplate(sentences, templateOptions);
  }

  let strategies = base.strategies;
  if (options?.evaluation?.topAdvice?.length) {
    const mapped = options.evaluation.topAdvice
      .slice(0, 2)
      .map((tip) => `優先改善: ${tip}`);
    strategies = [...strategies, ...mapped];
  }
  if (options?.evaluation?.actionPlan?.length) {
    const planSnippets = options.evaluation.actionPlan
      .slice(0, 2)
      .map((item) => `重点領域(${item.title}): ${item.summary}`);
    strategies = [...strategies, ...planSnippets];
  }

  const appliedStrategies = Array.from(new Set(strategies));

  return {
    text: base.text,
    summary: base.summary,
    appliedStrategies,
    actionPlan: options?.evaluation?.actionPlan
  } satisfies EssayImprovement;
}

