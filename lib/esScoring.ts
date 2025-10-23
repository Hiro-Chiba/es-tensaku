import type { EssayEvaluation, EssayImprovement, ReviewFocus } from "@/lib/types";

interface SentenceInfo {
  text: string;
  ending: string;
  length: number;
  commaCount: number;
  isKeigo: boolean;
  isPlain: boolean;
}

interface EvaluationContext {
  text: string;
  normalized: string;
  focus: ReviewFocus;
  topic?: string;
  charCount: number;
  paragraphs: string[];
  sentences: string[];
  sentenceInfos: SentenceInfo[];
  firstSentence: string;
  lastSentence: string;
  uniqueSentenceRatio: number;
  endingVariety: number;
  keigoRatio: number;
  plainRatio: number;
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
}

interface CheckDefinition {
  id: string;
  group: string;
  label: string;
  description: string;
  weight: number;
  advice: string;
  evaluate: (context: EvaluationContext) => boolean;
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

function normalizeText(text: string): string {
  return text.replace(/\r/g, "").trim();
}

function splitParagraphs(text: string): string[] {
  return normalizeText(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function splitSentences(text: string): string[] {
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

function buildEvaluationContext(text: string, focus: ReviewFocus, topic?: string): EvaluationContext {
  const normalized = normalizeText(text);
  const paragraphs = splitParagraphs(normalized);
  const sentences = splitSentences(normalized);
  const sentenceInfos = buildSentenceInfos(sentences);
  const charCount = normalized.replace(/\s+/g, "").length;
  const uniqueSentences = new Set(sentences);
  const uniqueSentenceRatio = sentences.length === 0 ? 1 : uniqueSentences.size / sentences.length;
  const endings = new Set(sentenceInfos.map((info) => info.ending));
  const keigoRatio = sentenceInfos.length === 0
    ? 1
    : sentenceInfos.filter((info) => info.isKeigo).length / sentenceInfos.length;
  const plainRatio = sentenceInfos.length === 0
    ? 0
    : sentenceInfos.filter((info) => info.isPlain).length / sentenceInfos.length;
  const maxSentenceLength = sentenceInfos.reduce((max, info) => Math.max(max, info.length), 0);
  const punctuationPerSentence = sentenceInfos.length === 0
    ? 0
    : sentenceInfos.reduce((sum, info) => sum + info.commaCount, 0) / sentenceInfos.length;
  const indentRatio = paragraphs.length === 0
    ? 1
    : paragraphs.filter((paragraph) => /^　/.test(paragraph)).length / paragraphs.length;
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

  return {
    text,
    normalized,
    focus,
    topic,
    charCount,
    paragraphs,
    sentences,
    sentenceInfos,
    firstSentence: sentences[0] ?? "",
    lastSentence: sentences[sentences.length - 1] ?? "",
    uniqueSentenceRatio,
    endingVariety: endings.size,
    keigoRatio,
    plainRatio,
    maxSentenceLength,
    punctuationPerSentence,
    indentRatio,
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
    timeExpressionCount
  } satisfies EvaluationContext;
}

function hasKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function paragraphsContaining(paragraphs: string[], keywords: string[]): number {
  return paragraphs.filter((paragraph) => hasKeywords(paragraph, keywords)).length;
}

function sentencesContaining(sentences: string[], keywords: string[]): string[] {
  return sentences.filter((sentence) => hasKeywords(sentence, keywords));
}
const generalChecks: CheckDefinition[] = [
  {
    id: "purpose",
    group: "全体構造",
    label: "文全体の目的明確化",
    description: "冒頭に文章の目的や結論が明示されているかを確認します。",
    weight: 4,
    advice: "冒頭で志望理由や伝えたい価値を一文で示しましょう。",
    evaluate: (context) => {
      const head = context.normalized.slice(0, 150);
      return /目的|志望|理由|価値|強み|結論/.test(head);
    }
  },
  {
    id: "storyline",
    group: "全体構造",
    label: "ストーリーラインの一貫性",
    description: "各段落で扱うテーマが一貫しているかをチェックします。",
    weight: 3,
    advice: "段落ごとに一貫したキーワードを用いて話の軸を揃えましょう。",
    evaluate: (context) => {
      if (context.paragraphs.length <= 1) return false;
      const focusKeywords: Record<ReviewFocus, string[]> = {
        motivation: ["志望", "理由", "貴社", "業界"],
        gakuchika: ["取り組", "活動", "課題", "学び"],
        selfPr: ["強み", "活か", "価値", "貢献"]
      };
      const keywords = focusKeywords[context.focus];
      const count = paragraphsContaining(context.paragraphs, keywords);
      return count >= Math.min(2, context.paragraphs.length);
    }
  },
  {
    id: "structure",
    group: "全体構造",
    label: "構成バランス",
    description: "PREP など論理的な構成になっているかを確認します。",
    weight: 3,
    advice: "結論→理由→具体例→再結論の順で段落を配置しましょう。",
    evaluate: (context) => context.paragraphs.length >= 3 && context.paragraphs.length <= 7
  },
  {
    id: "paragraph-balance",
    group: "全体構造",
    label: "文字数配分",
    description: "各段落の長さが過度に偏っていないかをチェックします。",
    weight: 2,
    advice: "段落ごとの文字量を揃えて読みやすくしましょう。",
    evaluate: (context) => context.paragraphBalance >= 0.45
  },
  {
    id: "logic",
    group: "全体構造",
    label: "論理の飛躍",
    description: "原因と結果をつなぐ接続語が十分に使われているかを判定します。",
    weight: 3,
    advice: "『そのため』『結果として』など因果を示す語を活用しましょう。",
    evaluate: (context) => context.causeEffectConnectorCount >= 2
  },
  {
    id: "redundancy",
    group: "全体構造",
    label: "冗長性",
    description: "同じ内容の繰り返しが少ないかを判断します。",
    weight: 2,
    advice: "似た意味の文は統合し、情報量を凝縮しましょう。",
    evaluate: (context) => context.uniqueSentenceRatio >= 0.6
  },
  {
    id: "opening-closing",
    group: "全体構造",
    label: "冒頭と結末の整合",
    description: "冒頭で示した主張が最後まで貫かれているかを確認します。",
    weight: 3,
    advice: "締めの一文で冒頭の結論や価値観を再掲しましょう。",
    evaluate: (context) => {
      if (!context.firstSentence || !context.lastSentence) return false;
      const keywords = ["志望", "理由", "強み", "価値", "貢献", "学び", "将来"];
      return keywords.some((keyword) => context.firstSentence.includes(keyword) && context.lastSentence.includes(keyword));
    }
  }
];

const styleChecks: CheckDefinition[] = [
  {
    id: "keigo",
    group: "文体・表現",
    label: "敬語統一",
    description: "です・ます調で統一されているかを確認します。",
    weight: 3,
    advice: "語尾を『です・ます』で揃えて丁寧さを保ちましょう。",
    evaluate: (context) => context.keigoRatio >= 0.8 && context.plainRatio <= 0.3
  },
  {
    id: "ending-diversity",
    group: "文体・表現",
    label: "文末表現の多様性",
    description: "語尾のバリエーションが十分かを判定します。",
    weight: 2,
    advice: "『〜と考えています』『〜と感じています』など語尾を変化させましょう。",
    evaluate: (context) => context.endingVariety >= Math.min(4, context.sentences.length)
  },
  {
    id: "sentence-length",
    group: "文体・表現",
    label: "一文の長さ",
    description: "一文が読みやすい長さに収まっているかをチェックします。",
    weight: 3,
    advice: "60文字を超える文は2文に分割しましょう。",
    evaluate: (context) => context.maxSentenceLength <= 65
  },
  {
    id: "typo",
    group: "文体・表現",
    label: "誤字脱字",
    description: "不自然な連続記号などがないかを確認します。",
    weight: 2,
    advice: "提出前に読み直し、誤字を排除しましょう。",
    evaluate: (context) => !/[A-Za-z]{3,}/.test(context.normalized)
  },
  {
    id: "punctuation",
    group: "文体・表現",
    label: "句読点",
    description: "句読点が適切に用いられているかを判定します。",
    weight: 2,
    advice: "一文に1〜3個を目安に読点を配置しましょう。",
    evaluate: (context) => context.punctuationPerSentence >= 0.5 && context.punctuationPerSentence <= 3
  },
  {
    id: "subject-predicate",
    group: "文体・表現",
    label: "主語述語対応",
    description: "主語が省略されすぎていないかを確認します。",
    weight: 2,
    advice: "『私は』『貴社は』など主語を適宜補いましょう。",
    evaluate: (context) => context.sentences.some((sentence) => /は|が/.test(sentence))
  },
  {
    id: "particle",
    group: "文体・表現",
    label: "助詞の精度",
    description: "助詞の重複がないかを判定します。",
    weight: 2,
    advice: "『にに』『をを』など助詞の連続を避けましょう。",
    evaluate: (context) => !/([をがにはへ])\1/u.test(context.normalized)
  },
  {
    id: "tense",
    group: "文体・表現",
    label: "時制統一",
    description: "過去形と現在形の混在度を確認します。",
    weight: 2,
    advice: "事実は過去形、抱負は現在形で整理しましょう。",
    evaluate: (context) => !(context.keigoRatio < 0.7 && context.plainRatio > 0.3)
  },
  {
    id: "colloquial",
    group: "文体・表現",
    label: "口語・スラング排除",
    description: "カジュアル表現が含まれていないかをチェックします。",
    weight: 3,
    advice: "ビジネスにそぐわない表現は削除しましょう。",
    evaluate: (context) => context.colloquialExpressions.length === 0
  },
  {
    id: "formatting",
    group: "文体・表現",
    label: "形式・段落整形",
    description: "段落の頭に全角スペースが入っているかを確認します。",
    weight: 1,
    advice: "各段落冒頭に全角スペースを入れて視認性を高めましょう。",
    evaluate: (context) => context.indentRatio >= 0.6
  }
];
function buildMotivationChecks(): CheckDefinition[] {
  return [
    {
      id: "motivation-conclusion",
      group: "志望動機",
      label: "結論先出し",
      description: "冒頭で志望理由が明示されているかを判定します。",
      weight: 3,
      advice: "『貴社を志望する理由は〜です』と最初に提示しましょう。",
      evaluate: (context) => /貴社を志望する理由|志望動機/.test(context.firstSentence)
    },
    {
      id: "motivation-three-layer",
      group: "志望動機",
      label: "動機の3階層構造",
      description: "業界・企業・職種の順で言及されているかを確認します。",
      weight: 3,
      advice: "業界→貴社→職種の順で理由を整理しましょう。",
      evaluate: (context) => {
        const industry = /業界|市場|社会課題/.test(context.normalized);
        const company = /貴社|理念|ビジョン|強み|価値観/.test(context.normalized);
        const role = /職種|業務|ポジション|役割/.test(context.normalized);
        return industry && company && role;
      }
    },
    {
      id: "motivation-company-understanding",
      group: "志望動機",
      label: "企業理解の深度",
      description: "貴社固有の情報に触れているかを判定します。",
      weight: 3,
      advice: "事業構造や競合優位性など具体的な特徴を書きましょう。",
      evaluate: (context) => /理念|事業|強み|独自|競合|価値提供/.test(context.normalized)
    },
    {
      id: "motivation-uniqueness",
      group: "志望動機",
      label: "自社特有要素の反映",
      description: "他社との差別化ポイントが含まれているかを確認します。",
      weight: 2,
      advice: "『他社ではなく貴社だからこそ』と明示しましょう。",
      evaluate: (context) => /他社|唯一|独自|唯一無二/.test(context.normalized)
    },
    {
      id: "motivation-empathy",
      group: "志望動機",
      label: "共感理由の明確化",
      description: "価値観やビジョンへの共感が言語化されているかを判定します。",
      weight: 2,
      advice: "理念やビジョンに共感した背景を書きましょう。",
      evaluate: (context) => /共感|価値観|ビジョン|使命/.test(context.normalized)
    },
    {
      id: "motivation-self-connection",
      group: "志望動機",
      label: "自己要素との接続",
      description: "自身の経験と会社の特徴が結びついているかを確認します。",
      weight: 3,
      advice: "自身の経験や強みが貴社で活きる理由を書きましょう。",
      evaluate: (context) => /経験|強み|背景|価値観/.test(context.normalized) && /貴社|企業|職種/.test(context.normalized)
    },
    {
      id: "motivation-contribution",
      group: "志望動機",
      label: "貢献イメージ",
      description: "入社後の貢献内容が具体的かを判定します。",
      weight: 3,
      advice: "入社後に実現したい価値提供を具体的に述べましょう。",
      evaluate: (context) => /貢献|提供|実現|支援/.test(context.normalized)
    },
    {
      id: "motivation-growth",
      group: "志望動機",
      label: "成長視点",
      description: "入社後の成長イメージが記載されているかを確認します。",
      weight: 2,
      advice: "学びたい専門性やスキルを明記しましょう。",
      evaluate: (context) => /成長|学び|習得|磨く/.test(context.normalized)
    },
    {
      id: "motivation-role-understanding",
      group: "志望動機",
      label: "職種理解",
      description: "希望職種の業務理解が示されているかを判定します。",
      weight: 2,
      advice: "業務内容や求められる力を具体的に捉えましょう。",
      evaluate: (context) => /職種|業務|顧客対応|提案|開発|運用/.test(context.normalized)
    },
    {
      id: "motivation-future-vision",
      group: "志望動機",
      label: "将来ビジョン整合",
      description: "中長期のキャリアと会社の方向性が一致しているかを確認します。",
      weight: 2,
      advice: "3〜5年後に成し遂げたい姿を描写しましょう。",
      evaluate: (context) => /中長期|将来|長期|ビジョン/.test(context.normalized)
    },
    {
      id: "motivation-social",
      group: "志望動機",
      label: "社会的意義",
      description: "顧客や社会への価値提供が語られているかを判定します。",
      weight: 2,
      advice: "貴社を通じた社会・顧客への価値を描きましょう。",
      evaluate: (context) => /社会|顧客|課題解決|価値提供/.test(context.normalized)
    },
    {
      id: "motivation-uniqueness-story",
      group: "志望動機",
      label: "独自性",
      description: "個人ならではのエピソードが含まれているかをチェックします。",
      weight: 2,
      advice: "自身の体験や気づきを織り交ぜましょう。",
      evaluate: (context) => /私自身|自分なり|独自|経験/.test(context.normalized)
    },
    {
      id: "motivation-banned",
      group: "志望動機",
      label: "禁止表現の回避",
      description: "抽象的な禁止表現を使用していないかを判定します。",
      weight: 2,
      advice: "『雰囲気が良い』などの抽象表現は避けましょう。",
      evaluate: (context) => context.bannedExpressions.length === 0
    }
  ];
}
function buildGakuchikaChecks(): CheckDefinition[] {
  return [
    {
      id: "gk-conclusion",
      group: "ガクチカ",
      label: "結論提示",
      description: "冒頭で取り組み内容が明示されているかを確認します。",
      weight: 3,
      advice: "冒頭で活動名を一文で示しましょう。",
      evaluate: (context) => /取り組|挑戦|活動|力を入れ/.test(context.firstSentence)
    },
    {
      id: "gk-background",
      group: "ガクチカ",
      label: "背景説明",
      description: "活動を始めた動機や問題意識が書かれているかを判定します。",
      weight: 2,
      advice: "活動を始めたきっかけを説明しましょう。",
      evaluate: (context) => /背景|きっかけ|課題意識|理由/.test(context.normalized)
    },
    {
      id: "gk-goal",
      group: "ガクチカ",
      label: "目標設定",
      description: "数値や期間などの目標が設定されているかを確認します。",
      weight: 3,
      advice: "目標値や期間を具体的に書きましょう。",
      evaluate: (context) => context.numericCount >= 1
    },
    {
      id: "gk-challenge",
      group: "ガクチカ",
      label: "課題認識",
      description: "直面した困難が具体的かを判定します。",
      weight: 2,
      advice: "課題や制約条件を具体的に描写しましょう。",
      evaluate: (context) => /課題|問題|壁|苦労/.test(context.normalized)
    },
    {
      id: "gk-action",
      group: "ガクチカ",
      label: "行動内容",
      description: "工夫や改善策が記述されているかを確認します。",
      weight: 3,
      advice: "実施した施策や役割を詳細に述べましょう。",
      evaluate: (context) => /工夫|改善|提案|実行|分析|施策/.test(context.normalized)
    },
    {
      id: "gk-ownership",
      group: "ガクチカ",
      label: "主体性",
      description: "自ら動いた描写があるかを判定します。",
      weight: 2,
      advice: "自発的に動いたエピソードを含めましょう。",
      evaluate: (context) => /自ら|主体的|率先|提案/.test(context.normalized)
    },
    {
      id: "gk-team",
      group: "ガクチカ",
      label: "チーム貢献",
      description: "周囲との協働が表れているかを確認します。",
      weight: 2,
      advice: "チームメンバーへの働きかけも記載しましょう。",
      evaluate: (context) => /チーム|メンバー|協力|巻き込/.test(context.normalized)
    },
    {
      id: "gk-result",
      group: "ガクチカ",
      label: "成果",
      description: "結果が数値や事実で示されているかを判定します。",
      weight: 3,
      advice: "成果を数字や評価で明記しましょう。",
      evaluate: (context) => context.numericCount >= 2 || /評価|成果|結果|達成/.test(context.normalized)
    },
    {
      id: "gk-learning",
      group: "ガクチカ",
      label: "学び・気づき",
      description: "得た学びが表現されているかを確認します。",
      weight: 2,
      advice: "経験から得た学びや価値観の変化を書きましょう。",
      evaluate: (context) => /学び|気づき|成長|得た/.test(context.normalized)
    },
    {
      id: "gk-application",
      group: "ガクチカ",
      label: "応用・再現性",
      description: "学びを今後に活かす姿勢が書かれているかを判定します。",
      weight: 2,
      advice: "学びを仕事にどう活かすかを言語化しましょう。",
      evaluate: (context) => /今後|社会人|貴社|活かす|応用/.test(context.normalized)
    },
    {
      id: "gk-logic",
      group: "ガクチカ",
      label: "論理的展開",
      description: "課題→行動→結果→学びの流れが見えるかを確認します。",
      weight: 2,
      advice: "見出しや接続語で時系列を明示しましょう。",
      evaluate: (context) => context.connectorCount >= 3
    },
    {
      id: "gk-chronology",
      group: "ガクチカ",
      label: "時系列明確",
      description: "時期の記載があるかをチェックします。",
      weight: 1,
      advice: "活動期間を年月や学年で示しましょう。",
      evaluate: (context) => context.timeExpressionCount >= 1
    },
    {
      id: "gk-objective",
      group: "ガクチカ",
      label: "客観性",
      description: "第三者の評価など客観的な要素があるかを判定します。",
      weight: 2,
      advice: "他者の評価やデータを引用しましょう。",
      evaluate: (context) => /評価|フィードバック|指標|データ/.test(context.normalized)
    }
  ];
}

function buildSelfPrChecks(): CheckDefinition[] {
  return [
    {
      id: "pr-strength",
      group: "自己PR",
      label: "強み定義",
      description: "強みが明確に名詞で示されているかを確認します。",
      weight: 3,
      advice: "『私の強みは○○です』と明確に書きましょう。",
      evaluate: (context) => /強みは|持ち味|武器/.test(context.firstSentence)
    },
    {
      id: "pr-episode",
      group: "自己PR",
      label: "根拠エピソード",
      description: "強みを裏付ける事例が書かれているかを判定します。",
      weight: 3,
      advice: "強みが発揮された具体例を示しましょう。",
      evaluate: (context) => /具体的|エピソード|経験|事例/.test(context.normalized)
    },
    {
      id: "pr-reproducibility",
      group: "自己PR",
      label: "再現性",
      description: "他場面でも再現できることが示されているかを確認します。",
      weight: 2,
      advice: "別の場面でも同様に強みを活かせる旨を書きましょう。",
      evaluate: (context) => /別|他|また|どのような場面/.test(context.normalized)
    },
    {
      id: "pr-application",
      group: "自己PR",
      label: "企業活用性",
      description: "強みを仕事に活かすイメージがあるかを判定します。",
      weight: 3,
      advice: "貴社で強みをどう活かすかを書きましょう。",
      evaluate: (context) => /貢献|活かす|提供|支援/.test(context.normalized)
    },
    {
      id: "pr-weakness",
      group: "自己PR",
      label: "弱点・補強",
      description: "課題や改善意識が書かれているかを確認します。",
      weight: 2,
      advice: "課題をどう補うかも触れましょう。",
      evaluate: (context) => /課題|弱み|改善|補う/.test(context.normalized)
    },
    {
      id: "pr-memorable",
      group: "自己PR",
      label: "記憶残存性",
      description: "印象に残る表現が含まれているかを判定します。",
      weight: 2,
      advice: "キャッチコピーや印象的なフレーズを入れましょう。",
      evaluate: (context) => /キーワード|キャッチフレーズ|象徴|一言/.test(context.normalized) || context.uniqueSentenceRatio <= 0.8
    }
  ];
}
const vocabularyChecks: CheckDefinition[] = [
  {
    id: "positive-ratio",
    group: "語彙・心理効果",
    label: "ポジティブ表現率",
    description: "肯定的な語が多いかを確認します。",
    weight: 2,
    advice: "成果や価値をポジティブに表現しましょう。",
    evaluate: (context) => context.positiveWordCount >= context.negativeWordCount
  },
  {
    id: "no-self-deprecation",
    group: "語彙・心理効果",
    label: "自己卑下禁止",
    description: "自己卑下表現が含まれていないかを判定します。",
    weight: 3,
    advice: "自信のなさを強調する表現は避けましょう。",
    evaluate: (context) => context.selfDeprecatingExpressions.length === 0
  },
  {
    id: "layout",
    group: "語彙・心理効果",
    label: "余白効果",
    description: "段落や改行が適切かを確認します。",
    weight: 1,
    advice: "段落間に余白を入れて読みやすくしましょう。",
    evaluate: (context) => context.blankLineCount >= Math.max(1, context.paragraphs.length - 1)
  },
  {
    id: "action-verbs",
    group: "語彙・心理効果",
    label: "動詞の具体性",
    description: "抽象的な動詞に偏っていないかを判定します。",
    weight: 2,
    advice: "『改善した』『設計した』など具体的な動詞を使いましょう。",
    evaluate: (context) => context.actionVerbCount >= 2
  },
  {
    id: "emotion-balance",
    group: "語彙・心理効果",
    label: "感情コントロール",
    description: "感情表現に偏っていないかを確認します。",
    weight: 1,
    advice: "感情より行動や結果に焦点を当てましょう。",
    evaluate: (context) => context.emotionalWordCount <= 3
  }
];

const consistencyChecks: CheckDefinition[] = [
  {
    id: "resume-consistency",
    group: "整合性・適合性",
    label: "履歴書との整合",
    description: "活動時期が明示され整合が取れているかを確認します。",
    weight: 1,
    advice: "履歴書の時期と矛盾しない年月を記載しましょう。",
    evaluate: (context) => context.timeExpressionCount >= 1
  },
  {
    id: "interview-ready",
    group: "整合性・適合性",
    label: "面接時再現性",
    description: "具体的な数値や事実が含まれているかを判定します。",
    weight: 2,
    advice: "面接で同じ説明ができるよう具体的な根拠を入れましょう。",
    evaluate: (context) => context.numericCount >= 1 || /具体|詳細/.test(context.normalized)
  },
  {
    id: "mission-fit",
    group: "整合性・適合性",
    label: "企業理念整合",
    description: "Mission/Vision/Value との接続が示されているかを確認します。",
    weight: 2,
    advice: "企業理念に触れ、その価値観と自分の接点を描きましょう。",
    evaluate: (context) => /理念|ビジョン|ミッション|価値観/.test(context.normalized)
  },
  {
    id: "position-fit",
    group: "整合性・適合性",
    label: "応募ポジション適合",
    description: "希望職種に必要な素質を意識しているかを判定します。",
    weight: 2,
    advice: "ポジションに求められる力と自分の強みを結びつけましょう。",
    evaluate: (context) => /スキル|能力|素質|強み/.test(context.normalized)
  },
  {
    id: "ethics",
    group: "整合性・適合性",
    label: "倫理・守秘",
    description: "守秘情報を開示していないかを確認します。",
    weight: 2,
    advice: "固有名詞や機密情報の開示に注意しましょう。",
    evaluate: (context) => !/社外秘|機密|具体的な顧客名/.test(context.normalized)
  }
];

function getFocusChecks(focus: ReviewFocus): CheckDefinition[] {
  switch (focus) {
    case "motivation":
      return buildMotivationChecks();
    case "gakuchika":
      return buildGakuchikaChecks();
    case "selfPr":
      return buildSelfPrChecks();
    default:
      return [];
  }
}
export function evaluateEssay(
  text: string,
  focus: ReviewFocus,
  options?: { topic?: string }
): EssayEvaluation {
  const context = buildEvaluationContext(text, focus, options?.topic);
  const definitions = [
    ...generalChecks,
    ...styleChecks,
    ...getFocusChecks(focus),
    ...vocabularyChecks,
    ...consistencyChecks
  ];

  const results = definitions.map((definition) => {
    const passed = definition.evaluate(context);
    return {
      id: definition.id,
      label: definition.label,
      group: definition.group,
      description: definition.description,
      weight: definition.weight,
      passed,
      advice: definition.advice
    };
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

  const improvementAdvice = results
    .filter((result) => !result.passed)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((result) => `${result.label}: ${result.advice}`);

  return {
    score: normalizedScore,
    rawScore: achievedScore,
    maxScore,
    checks: results,
    groupSummaries,
    topAdvice: improvementAdvice
  } satisfies EssayEvaluation;
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

interface TemplateOptions {
  topic?: string;
  useOriginalSnippets: boolean;
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
      `まず、${stripEnding(industrySentence ?? "業界全体が転換期を迎えているいま") }という認識を持ち、長期的な市場の変化に応える専門性を磨いてきました。`
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
    ? pickSentence(sentences, ["学び", "気づき", "成長", "価値観"])
    : undefined;

  const paragraphs = [
    wrapParagraph(
      `私が学生時代に力を入れたのは${
        stripEnding(activitySentence ?? "学内プロジェクトでの課題解決活動")
      }です。`
    ),
    wrapParagraph(
      `背景として、所属組織では参加者満足度が伸び悩み、改善を求める声が高まっていました。私は現状分析から着手し、原因を明確化する必要性を感じました。`
    ),
    wrapParagraph(
      `そこで、3か月間で満足度指標を20％向上させることを目標に掲げ、週次でKPIを可視化する体制を整備しました。`
    ),
    wrapParagraph(
      `直面した課題は${stripEnding(challengeSentence ?? "メンバーの問題意識に差があり改革が進まなかったこと") }であり、共通認識づくりが急務でした。`
    ),
    wrapParagraph(
      `私は${stripEnding(
        actionSentence ?? "ヒアリング結果を共有しながら役割分担と行動計画を再設計"
      )}し、PDCAを高速で回す体制を整備しました。同時に、外部の専門家にも助言を仰ぎ取り組みの精度を高めました。`
    ),
    wrapParagraph(
      `その結果、イベント満足度は当初目標を超える92％に達し、参加者数も前年同期比で130％まで拡大しました。チーム内でも主体的に動くメンバーが増え、改善文化が定着しました。`
    ),
    wrapParagraph(
      `${stripEnding(learningSentence ?? "この経験を通じて、課題を定量化し関係者を巻き込む重要性") }を学び、データと対話を組み合わせる意思決定スタイルが自分の強みだと再確認しました。`
    ),
    wrapParagraph(
      `今後は、この経験で得た課題設定力と実行力を活かし、貴社のプロジェクトでも顧客価値の向上と組織変革を両立させていきます。`
    )
  ];

  const strategies = [
    "結論→背景→目標→課題→行動→結果→学びの時系列整理",
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
  options?: { topic?: string; evaluation?: EssayEvaluation; forceStructured?: boolean }
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

  const appliedStrategies = Array.from(new Set(strategies));

  return {
    text: base.text,
    summary: base.summary,
    appliedStrategies
  };
}
