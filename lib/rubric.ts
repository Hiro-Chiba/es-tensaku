import type { ReviewFocus } from "@/lib/types";
import type { EvaluationContext } from "@/lib/evaluationContext";

export interface RubricCriterion {
  rubricId: number;
  id: string;
  group: string;
  label: string;
  description: string;
  advice: string;
  weight: number;
  focus?: ReviewFocus[];
  industries?: string[];
  jobCategories?: string[];
  tags?: string[];
  evaluate: (context: EvaluationContext) => boolean;
}

const ambiguousWords = ["さまざま", "少し", "かもしれ", "なんとなく"];
const blamePatterns = [/のせい/, /責任を/];

const commonOverallImpression: RubricCriterion[] = [
  {
    rubricId: 1,
    id: "common.conclusionFirst",
    group: "共通構成_全体印象",
    label: "結論ファースト",
    description: "冒頭で主張を明確に提示しているかを確認します。",
    advice: "一文目で志望理由や強みなどのメインメッセージを言い切りましょう。",
    weight: 4,
    evaluate: (context) => {
      const head = context.normalized.slice(0, 120);
      return /志望|理由|結論|強み|成果|価値/.test(head);
    }
  },
  {
    rubricId: 2,
    id: "common.consistentTheme",
    group: "共通構成_全体印象",
    label: "主張の一貫性",
    description: "段落ごとに扱うテーマがブレていないかを判断します。",
    advice: "段落ごとにキーワードを揃え、全体の論点がぶれないよう設計しましょう。",
    weight: 3,
    evaluate: (context) => context.themeKeywordCoverage >= 0.6
  },
  {
    rubricId: 3,
    id: "common.readability",
    group: "共通構成_全体印象",
    label: "読みやすさ",
    description: "文長や句読点のバランスが適切かを判定します。",
    advice: "一文60文字以内とし、読点は1〜3個を目安に入れましょう。",
    weight: 3,
    evaluate: (context) =>
      context.averageSentenceLength <= 60 &&
      context.punctuationPerSentence >= 0.5 &&
      context.punctuationPerSentence <= 3
  },
  {
    rubricId: 4,
    id: "common.noTypos",
    group: "共通構成_全体印象",
    label: "誤字脱字",
    description: "誤記や不自然な記号がないかをチェックします。",
    advice: "提出前に音読して誤字や重複記号がないかを確認しましょう。",
    weight: 2,
    evaluate: (context) =>
      !/[A-Za-z]{4,}/.test(context.normalized) &&
      !/(。。|、、|！！|？？)/.test(context.normalized)
  },
  {
    rubricId: 5,
    id: "common.wordCountManagement",
    group: "共通構成_全体印象",
    label: "字数管理",
    description: "指定文字数を有効活用できているかを判定します。",
    advice: "8割以上埋めることを意識し、余白を残しすぎないようにしましょう。",
    weight: 2,
    evaluate: (context) => {
      if (context.targetCharacterCount && context.targetCharacterCount > 0) {
        const coverage = context.targetCoverage ?? 0;
        return coverage >= 0.85 && coverage <= 1.2;
      }
      return context.charCount >= 300;
    }
  },
  {
    rubricId: 6,
    id: "common.logicalStructure",
    group: "共通構成_全体印象",
    label: "段落構成",
    description: "論理的な段落構成になっているかを確認します。",
    advice: "導入・背景・具体例・結論の4段構成を意識しましょう。",
    weight: 3,
    evaluate: (context) => context.paragraphs.length >= 3 && context.paragraphBalance >= 0.45
  },
  {
    rubricId: 7,
    id: "common.abstractConcreteBalance",
    group: "共通構成_全体印象",
    label: "抽象具体バランス",
    description: "理念と具体行動のバランスが取れているかを判定します。",
    advice: "理念や価値観に触れる際は、必ず具体例や数字で裏付けましょう。",
    weight: 2,
    evaluate: (context) => context.abstractKeywordCount > 0 && context.concreteKeywordCount > 0
  },
  {
    rubricId: 8,
    id: "common.subjectPredicate",
    group: "共通構成_全体印象",
    label: "主語述語対応",
    description: "主語が省略されすぎていないかを確認します。",
    advice: "『私は』『貴社は』など主語を意識的に配置しましょう。",
    weight: 2,
    evaluate: (context) => {
      if (context.sentences.length === 0) return false;
      const withSubject = context.sentences.filter((sentence) => /は|が/.test(sentence));
      return withSubject.length / context.sentences.length >= 0.6;
    }
  },
  {
    rubricId: 9,
    id: "common.vocabularyDiversity",
    group: "共通構成_全体印象",
    label: "語彙の多様性",
    description: "語彙の使い回しが少ないかを判断します。",
    advice: "同じ語尾や形容詞が続く場合は類語に置き換えましょう。",
    weight: 2,
    evaluate: (context) => context.uniqueWordRatio >= 0.55
  },
  {
    rubricId: 10,
    id: "common.personalVoice",
    group: "共通構成_全体印象",
    label: "自分の言葉",
    description: "テンプレート的な表現に頼っていないかを確認します。",
    advice: "汎用的なフレーズではなく、自身の経験に紐づく言葉に置き換えましょう。",
    weight: 3,
    evaluate: (context) => context.bannedExpressions.length === 0 && context.uniqueSentenceRatio >= 0.6
  }
];

const contentEssential: RubricCriterion[] = [
  {
    rubricId: 11,
    id: "content.transferability",
    group: "内容面_本質的評価",
    label: "再現性",
    description: "過去の経験を今後へ活かす展開があるかを判定します。",
    advice: "経験から得た学びを、今後どのように活かすかを書き切りましょう。",
    weight: 3,
    evaluate: (context) => context.futureCount > 0 && /活か/.test(context.normalized)
  },
  {
    rubricId: 12,
    id: "content.growthMindset",
    group: "内容面_本質的評価",
    label: "成長志向",
    description: "学びや改善意識が表現されているかを確認します。",
    advice: "『学んだ』『改善した』など成長を示す語を明記しましょう。",
    weight: 3,
    evaluate: (context) => /学び|成長|改善/.test(context.normalized)
  },
  {
    rubricId: 13,
    id: "content.proactiveAction",
    group: "内容面_本質的評価",
    label: "行動主導性",
    description: "自ら考え行動したプロセスが語られているかを判定します。",
    advice: "『自ら』『主体的に』など能動的な語と具体行動を組み合わせましょう。",
    weight: 3,
    evaluate: (context) => context.actionVerbCount >= 3 || /主体的|自ら/.test(context.normalized)
  },
  {
    rubricId: 14,
    id: "content.problemFinding",
    group: "内容面_本質的評価",
    label: "問題発見力",
    description: "課題設定の視点が明確かを確認します。",
    advice: "『課題』『背景』『原因』の語で問題設定を明示しましょう。",
    weight: 2,
    evaluate: (context) => /課題|問題|原因|ボトルネック/.test(context.normalized)
  },
  {
    rubricId: 15,
    id: "content.solutionUniqueness",
    group: "内容面_本質的評価",
    label: "解決策の独自性",
    description: "自分の発想で取り組んだ痕跡があるかを判定します。",
    advice: "他者依存ではなく、自ら考案した工夫を描写しましょう。",
    weight: 2,
    evaluate: (context) => /独自|工夫|自ら|分析/.test(context.normalized)
  },
  {
    rubricId: 16,
    id: "content.quantitativeEvidence",
    group: "内容面_本質的評価",
    label: "定量的裏付け",
    description: "数字・期間・成果が記載されているかを確認します。",
    advice: "成果やプロセスには必ず数字や期間を添えましょう。",
    weight: 3,
    evaluate: (context) => context.numericCount >= 1
  },
  {
    rubricId: 17,
    id: "content.qualitativeFeedback",
    group: "内容面_本質的評価",
    label: "定性的評価",
    description: "第三者の評価や感想が含まれているかを判定します。",
    advice: "『感謝された』『評価を得た』など周囲の声を引用しましょう。",
    weight: 2,
    evaluate: (context) => context.gratitudeCount > 0
  },
  {
    rubricId: 18,
    id: "content.objectiveResult",
    group: "内容面_本質的評価",
    label: "結果の客観性",
    description: "成果が現実的な表現になっているかを確認します。",
    advice: "成果と課題の両面を記載し、客観性を担保しましょう。",
    weight: 2,
    evaluate: (context) => context.positiveWordCount > 0 && (context.reflectionCount > 0 || context.negativeWordCount > 0)
  },
  {
    rubricId: 19,
    id: "content.socialImpact",
    group: "内容面_本質的評価",
    label: "社会的価値",
    description: "行動が他者や組織に貢献しているかを判定します。",
    advice: "顧客・組織・社会への影響を一文で表現しましょう。",
    weight: 2,
    evaluate: (context) => context.socialImpactCount > 0
  },
  {
    rubricId: 20,
    id: "content.reflection",
    group: "内容面_本質的評価",
    label: "内省",
    description: "失敗や反省からの学びが書かれているかを確認します。",
    advice: "課題認識とそこからの改善をセットで書きましょう。",
    weight: 2,
    evaluate: (context) => context.reflectionCount > 0
  }
];

const motivationSpecific: RubricCriterion[] = [
  {
    rubricId: 21,
    id: "motivation.companyUnderstanding",
    group: "設問別_志望動機",
    label: "企業理解",
    description: "事業内容や業界構造を説明できているかを判定します。",
    advice: "貴社の事業モデルや強みを自分の言葉で整理しましょう。",
    weight: 3,
    focus: ["motivation"],
    evaluate: (context) => /貴社|事業|市場|構造/.test(context.normalized)
  },
  {
    rubricId: 22,
    id: "motivation.industryReason",
    group: "設問別_志望動機",
    label: "業界選択理由",
    description: "業界を選んだ理由が論理的かを確認します。",
    advice: "業界の魅力や課題認識を明確に述べましょう。",
    weight: 2,
    focus: ["motivation"],
    evaluate: (context) => /業界|市場|社会課題/.test(context.normalized)
  },
  {
    rubricId: 23,
    id: "motivation.companyDifferentiation",
    group: "設問別_志望動機",
    label: "企業選択理由",
    description: "他社との違いを把握しているかを判定します。",
    advice: "『他社ではなく貴社』と感じた要素を比較軸で語りましょう。",
    weight: 3,
    focus: ["motivation"],
    evaluate: (context) => /他社|唯一|差別化|独自/.test(context.normalized)
  },
  {
    rubricId: 24,
    id: "motivation.empathy",
    group: "設問別_志望動機",
    label: "事業共感性",
    description: "企業理念や価値観への共感があるかを確認します。",
    advice: "理念やビジョンに共感した背景を具体的に書きましょう。",
    weight: 2,
    focus: ["motivation"],
    evaluate: (context) => /共感|理念|ビジョン|使命/.test(context.normalized)
  },
  {
    rubricId: 25,
    id: "motivation.productKnowledge",
    group: "設問別_志望動機",
    label: "商品・技術理解",
    description: "主力製品やサービスに触れているかを判定します。",
    advice: "具体的なサービス名や技術に紐づけて志望理由を書きましょう。",
    weight: 2,
    focus: ["motivation"],
    evaluate: (context) => /製品|サービス|技術|プロダクト/.test(context.normalized)
  },
  {
    rubricId: 26,
    id: "motivation.futureAlignment",
    group: "設問別_志望動機",
    label: "将来ビジョン整合",
    description: "自身の将来像と企業の方向性が一致しているかを確認します。",
    advice: "中長期で実現したい姿と会社のビジョンの接点を描きましょう。",
    weight: 2,
    focus: ["motivation"],
    evaluate: (context) => context.futureCount > 0 && /ビジョン|将来|長期/.test(context.normalized)
  },
  {
    rubricId: 27,
    id: "motivation.contribution",
    group: "設問別_志望動機",
    label: "貢献内容明確",
    description: "入社後にどう貢献するかを具体化できているかを判定します。",
    advice: "貢献先・手段・成果イメージの3点セットで書きましょう。",
    weight: 3,
    focus: ["motivation"],
    evaluate: (context) => /貢献|提供|支援|価値/.test(context.normalized)
  },
  {
    rubricId: 28,
    id: "motivation.industryChallenges",
    group: "設問別_志望動機",
    label: "業界課題認識",
    description: "業界の課題を自分の視点で捉えているかを確認します。",
    advice: "業界の変化や課題を提示し、自分の視点で言語化しましょう。",
    weight: 2,
    focus: ["motivation"],
    evaluate: (context) => /課題|変化|DX|競争/.test(context.normalized)
  },
  {
    rubricId: 29,
    id: "motivation.postEntryVision",
    group: "設問別_志望動機",
    label: "入社後展望",
    description: "配属・業務イメージを具体的に描けているかを判定します。",
    advice: "希望部署やプロジェクトを例示し、そこでの貢献像を書きましょう。",
    weight: 2,
    focus: ["motivation"],
    evaluate: (context) => /入社後|配属|業務|担当/.test(context.normalized)
  },
  {
    rubricId: 30,
    id: "motivation.uniqueAngle",
    group: "設問別_志望動機",
    label: "独自視点",
    description: "他者と差別化できる視点があるかを確認します。",
    advice: "自分ならではの経験や気づきから志望理由を語りましょう。",
    weight: 2,
    focus: ["motivation"],
    evaluate: (context) => /自分なり|独自|私自身の経験/.test(context.normalized)
  }
];

const gakuchikaSpecific: RubricCriterion[] = [
  {
    rubricId: 31,
    id: "gakuchika.problemDiscovery",
    group: "設問別_ガクチカ",
    label: "課題発見",
    description: "自ら問題点を見つけた描写があるかを判定します。",
    advice: "現状把握から課題設定までの思考プロセスを描きましょう。",
    weight: 3,
    focus: ["gakuchika"],
    evaluate: (context) => /課題|問題提起|違和感/.test(context.normalized)
  },
  {
    rubricId: 32,
    id: "gakuchika.teamRole",
    group: "設問別_ガクチカ",
    label: "チーム内役割",
    description: "自身の役割や立場を説明できているかを確認します。",
    advice: "リーダー・サブリーダーなど役割名と責任範囲を明記しましょう。",
    weight: 2,
    focus: ["gakuchika"],
    evaluate: (context) => /役割|担当|リーダー|フォロー/.test(context.normalized)
  },
  {
    rubricId: 33,
    id: "gakuchika.difficultyDetail",
    group: "設問別_ガクチカ",
    label: "困難内容具体",
    description: "困難やトラブルの詳細が書かれているかを判定します。",
    advice: "壁となった出来事を状況描写とともに具体的に説明しましょう。",
    weight: 2,
    focus: ["gakuchika"],
    evaluate: (context) => /困難|壁|苦戦|トラブル/.test(context.normalized)
  },
  {
    rubricId: 34,
    id: "gakuchika.improvementProcess",
    group: "設問別_ガクチカ",
    label: "取組改善プロセス",
    description: "仮説→試行→検証の流れがあるかを確認します。",
    advice: "仮説設定・試行・検証・改善のステップを順序立てて書きましょう。",
    weight: 3,
    focus: ["gakuchika"],
    evaluate: (context) => /仮説|検証|改善|振り返り/.test(context.normalized)
  },
  {
    rubricId: 35,
    id: "gakuchika.results",
    group: "設問別_ガクチカ",
    label: "成果",
    description: "努力の結果が明確かを判定します。",
    advice: "成果を数字や比較で示し、達成度を可視化しましょう。",
    weight: 3,
    focus: ["gakuchika"],
    evaluate: (context) => context.numericCount >= 1 || /成果|結果|達成/.test(context.normalized)
  },
  {
    rubricId: 36,
    id: "gakuchika.transfer",
    group: "設問別_ガクチカ",
    label: "学び転用",
    description: "他の活動へ学びを応用しているかを確認します。",
    advice: "学んだことを別の場面でどう活かしたかを添えましょう。",
    weight: 2,
    focus: ["gakuchika"],
    evaluate: (context) => /他|別|また|応用/.test(context.normalized) && /活か/.test(context.normalized)
  },
  {
    rubricId: 37,
    id: "gakuchika.initiative",
    group: "設問別_ガクチカ",
    label: "主体性",
    description: "上からの指示ではなく自ら動いたかを判定します。",
    advice: "『提案した』『主導した』など主体性を示す語を盛り込みましょう。",
    weight: 3,
    focus: ["gakuchika"],
    evaluate: (context) => /提案|主導|自ら|発案/.test(context.normalized)
  },
  {
    rubricId: 38,
    id: "gakuchika.teamwork",
    group: "設問別_ガクチカ",
    label: "チームワーク",
    description: "協働や信頼関係構築が記述されているかを確認します。",
    advice: "メンバーとの対話や役割分担に触れましょう。",
    weight: 2,
    focus: ["gakuchika"],
    evaluate: (context) => /チーム|協力|連携|巻き込/.test(context.normalized)
  },
  {
    rubricId: 39,
    id: "gakuchika.persistence",
    group: "設問別_ガクチカ",
    label: "継続性",
    description: "活動が短期で終わらず継続しているかを判定します。",
    advice: "活動期間や継続期間を数字で記載しましょう。",
    weight: 2,
    focus: ["gakuchika"],
    evaluate: (context) => context.timeExpressionCount > 0
  },
  {
    rubricId: 40,
    id: "gakuchika.passion",
    group: "設問別_ガクチカ",
    label: "情熱・熱意",
    description: "やり遂げたい熱量が伝わるかを確認します。",
    advice: "挑戦心や粘り強さを示す語を添えましょう。",
    weight: 2,
    focus: ["gakuchika"],
    evaluate: (context) => /熱意|挑戦|やり遂げ|粘り強/.test(context.normalized)
  }
];

const selfPrSpecific: RubricCriterion[] = [
  {
    rubricId: 41,
    id: "selfPr.strengthDefinition",
    group: "設問別_自己PR",
    label: "強み定義明確",
    description: "強みを一言で表現できているかを判定します。",
    advice: "冒頭で『私の強みは〜です』と言い切りましょう。",
    weight: 3,
    focus: ["selfPr"],
    evaluate: (context) => /強みは|持ち味|武器/.test(context.firstSentence)
  },
  {
    rubricId: 42,
    id: "selfPr.supportingEpisode",
    group: "設問別_自己PR",
    label: "裏付けエピソード",
    description: "強みの根拠となる事例があるかを確認します。",
    advice: "強みが発揮された具体的な場面を描きましょう。",
    weight: 3,
    focus: ["selfPr"],
    evaluate: (context) => /具体|経験|エピソード|事例/.test(context.normalized)
  },
  {
    rubricId: 43,
    id: "selfPr.reproducibility",
    group: "設問別_自己PR",
    label: "再現可能性",
    description: "別の環境でも強みを活かせる説明があるかを判定します。",
    advice: "他の場面でも同様に発揮できる根拠を示しましょう。",
    weight: 2,
    focus: ["selfPr"],
    evaluate: (context) => /別|また|どのような場面|他/.test(context.normalized)
  },
  {
    rubricId: 44,
    id: "selfPr.externalValidation",
    group: "設問別_自己PR",
    label: "他者評価",
    description: "周囲からの評価で強みが裏付けられているかを確認します。",
    advice: "上司や仲間からの評価・期待に言及しましょう。",
    weight: 2,
    focus: ["selfPr"],
    evaluate: (context) => /評価|任された|信頼|期待/.test(context.normalized)
  },
  {
    rubricId: 45,
    id: "selfPr.resultLink",
    group: "設問別_自己PR",
    label: "成果に繋がった経験",
    description: "強みが成果に繋がったかを判定します。",
    advice: "成果を数値や変化で表現し、強みとの因果を示しましょう。",
    weight: 3,
    focus: ["selfPr"],
    evaluate: (context) => context.numericCount >= 1 || /成果|結果|達成/.test(context.normalized)
  },
  {
    rubricId: 46,
    id: "selfPr.weaknessComplement",
    group: "設問別_自己PR",
    label: "弱み補完",
    description: "弱みへの改善策に触れているかを確認します。",
    advice: "課題をどう克服しているか、工夫を添えましょう。",
    weight: 2,
    focus: ["selfPr"],
    evaluate: (context) => /弱み|課題|改善|補う/.test(context.normalized)
  },
  {
    rubricId: 47,
    id: "selfPr.valuesAlignment",
    group: "設問別_自己PR",
    label: "信念・価値観連動",
    description: "強みと価値観が結びついているかを判定します。",
    advice: "価値観や信念を明示し、強みの背景を語りましょう。",
    weight: 2,
    focus: ["selfPr"],
    evaluate: (context) => /価値観|信念|大切に/.test(context.normalized)
  },
  {
    rubricId: 48,
    id: "selfPr.consistency",
    group: "設問別_自己PR",
    label: "継続証拠",
    description: "長期間発揮している証拠があるかを確認します。",
    advice: "継続期間や複数事例を示して、一過性ではないことを伝えましょう。",
    weight: 2,
    focus: ["selfPr"],
    evaluate: (context) => context.timeExpressionCount > 0 || /継続|続け/.test(context.normalized)
  },
  {
    rubricId: 49,
    id: "selfPr.adaptability",
    group: "設問別_自己PR",
    label: "環境適応",
    description: "異なる環境でも強みを活かしているかを判定します。",
    advice: "環境変化や多様な場で強みを発揮した事例を盛り込みましょう。",
    weight: 2,
    focus: ["selfPr"],
    evaluate: (context) => /環境|異なる|多様|幅広/.test(context.normalized)
  },
  {
    rubricId: 50,
    id: "selfPr.socialContribution",
    group: "設問別_自己PR",
    label: "社会的意義",
    description: "強みを社会に還元する姿勢があるかを確認します。",
    advice: "顧客や社会へどのような価値を提供するかを書きましょう。",
    weight: 2,
    focus: ["selfPr"],
    evaluate: (context) => context.socialImpactCount > 0 || /社会|顧客|地域/.test(context.normalized)
  }
];

const styleAndLanguage: RubricCriterion[] = [
  {
    rubricId: 204,
    id: "style.keigoConsistency",
    group: "文体_表現_マイナスチェック",
    label: "敬体常体統一",
    description: "文体が統一されているかを確認します。",
    advice: "敬体を使う場合は語尾を『です・ます』で統一しましょう。",
    weight: 3,
    evaluate: (context) => context.keigoRatio >= 0.8 && context.plainRatio <= 0.3
  },
  {
    rubricId: 205,
    id: "style.noColloquial",
    group: "文体_表現_マイナスチェック",
    label: "口語表現禁止",
    description: "砕けた話し言葉が含まれていないかを判定します。",
    advice: "『とか』『すごく』などカジュアル語はビジネス表現へ置換しましょう。",
    weight: 3,
    evaluate: (context) => context.colloquialExpressions.length === 0
  },
  {
    rubricId: 206,
    id: "style.connectors",
    group: "文体_表現_マイナスチェック",
    label: "接続詞適切",
    description: "論理的なつながりが維持されているかを確認します。",
    advice: "因果を示す接続詞を最低2回は使用しましょう。",
    weight: 2,
    evaluate: (context) => context.causeEffectConnectorCount >= 2
  },
  {
    rubricId: 207,
    id: "style.noAmbiguous",
    group: "文体_表現_マイナスチェック",
    label: "曖昧表現排除",
    description: "曖昧な語が乱用されていないかを判定します。",
    advice: "『さまざま』『少し』などは具体的な数字や固有名詞に置き換えましょう。",
    weight: 2,
    evaluate: (context) => !ambiguousWords.some((word) => context.normalized.includes(word))
  },
  {
    rubricId: 208,
    id: "style.avoidNegative",
    group: "文体_表現_マイナスチェック",
    label: "否定的表現注意",
    description: "不必要な自己否定がないかを確認します。",
    advice: "課題は改善意欲とセットで語り、ネガティブさを抑えましょう。",
    weight: 2,
    evaluate: (context) => context.negativeWordCount <= context.positiveWordCount + 2
  },
  {
    rubricId: 209,
    id: "style.storyConsistency",
    group: "文体_表現_マイナスチェック",
    label: "ストーリー一貫",
    description: "文章全体に矛盾がないかを判定します。",
    advice: "冒頭と結論で同じ主張を再確認しましょう。",
    weight: 2,
    evaluate: (context) => {
      if (!context.firstSentence || !context.lastSentence) return false;
      const keywords = ["志望", "理由", "強み", "価値", "学び", "将来"];
      return keywords.some((keyword) => context.firstSentence.includes(keyword) && context.lastSentence.includes(keyword));
    }
  },
  {
    rubricId: 210,
    id: "style.timeline",
    group: "文体_表現_マイナスチェック",
    label: "時系列明瞭",
    description: "活動時期が明確かを確認します。",
    advice: "年月や期間を記載して時系列を整理しましょう。",
    weight: 2,
    evaluate: (context) => context.timeExpressionCount > 0
  },
  {
    rubricId: 211,
    id: "style.characterLimit",
    group: "文体_表現_マイナスチェック",
    label: "文字数遵守",
    description: "指定文字数を過不足なく使えているかを判定します。",
    advice: "指定がある場合は8〜9割を目安に書きましょう。",
    weight: 2,
    evaluate: (context) => {
      if (!context.targetCharacterCount) return context.charCount >= 300;
      const coverage = context.targetCoverage ?? 0;
      return coverage >= 0.85 && coverage <= 1.15;
    }
  },
  {
    rubricId: 212,
    id: "style.properHonorific",
    group: "文体_表現_マイナスチェック",
    label: "敬語適切",
    description: "企業への敬称が適切かを確認します。",
    advice: "企業を指す際は『貴社』を用いるなど敬語を守りましょう。",
    weight: 2,
    evaluate: (context) => !/御社/.test(context.normalized) && (!context.topic || /貴社|貴行|貴学/.test(context.normalized))
  },
  {
    rubricId: 213,
    id: "style.balanceConfidence",
    group: "文体_表現_マイナスチェック",
    label: "自慢謙遜バランス",
    description: "謙虚さと自信のバランスが取れているかを判定します。",
    advice: "成果を述べる際は根拠と改善意識をセットで書きましょう。",
    weight: 2,
    evaluate: (context) => context.positiveWordCount > 0 && context.reflectionCount > 0
  },
  {
    rubricId: 214,
    id: "style.clearConclusion",
    group: "文体_表現_マイナスチェック",
    label: "結論明瞭",
    description: "各設問の要点が冒頭で示されているかを確認します。",
    advice: "導入文で『結論→理由』の順に要点を整理しましょう。",
    weight: 2,
    evaluate: (context) => /結論|要するに|端的に/.test(context.firstSentence) || /志望|強み/.test(context.firstSentence)
  },
  {
    rubricId: 215,
    id: "style.sentenceLength",
    group: "文体_表現_マイナスチェック",
    label: "適切な文長",
    description: "一文が長すぎないかを判定します。",
    advice: "60文字以上の文は分割し、リズムを整えましょう。",
    weight: 2,
    evaluate: (context) => context.maxSentenceLength <= 65
  },
  {
    rubricId: 216,
    id: "style.noTyposAgain",
    group: "文体_表現_マイナスチェック",
    label: "誤字脱字無し",
    description: "漢字変換ミスや脱字がないかを確認します。",
    advice: "投稿前に漢字変換や送り仮名を見直しましょう。",
    weight: 2,
    evaluate: (context) => !/(誤|脱字)/.test(context.normalized)
  },
  {
    rubricId: 217,
    id: "style.punctuation",
    group: "文体_表現_マイナスチェック",
    label: "句読点と記号",
    description: "句読点の使い方が適切かを判定します。",
    advice: "句読点や記号を適量に抑え、顔文字などは避けましょう。",
    weight: 2,
    evaluate: (context) => !/[♪☆★]|\.{3}/.test(context.normalized) && context.punctuationPerSentence <= 3.5
  },
  {
    rubricId: 218,
    id: "style.noTemplate",
    group: "文体_表現_マイナスチェック",
    label: "テンプレート臭皆無",
    description: "使い古された表現に頼っていないかを確認します。",
    advice: "定番フレーズは自分の経験に置き換えて独自性を出しましょう。",
    weight: 2,
    evaluate: (context) => context.bannedExpressions.length === 0 && context.uniqueSentenceRatio >= 0.65
  },
  {
    rubricId: 219,
    id: "style.noBlame",
    group: "文体_表現_マイナスチェック",
    label: "責任転嫁無し",
    description: "他者への責任転嫁がないかを判定します。",
    advice: "失敗は自分事として捉え、学びに転換しましょう。",
    weight: 2,
    evaluate: (context) => !blamePatterns.some((pattern) => pattern.test(context.normalized))
  },
  {
    rubricId: 220,
    id: "style.selfConsistency",
    group: "文体_表現_マイナスチェック",
    label: "自己一致",
    description: "文章全体が自身の価値観と矛盾しないかを確認します。",
    advice: "強み・価値観・志向性が全体で一致しているか振り返りましょう。",
    weight: 2,
    evaluate: (context) => context.positiveWordCount >= context.negativeWordCount
  },
  {
    rubricId: 221,
    id: "style.positiveTone",
    group: "文体_表現_マイナスチェック",
    label: "前向き表現",
    description: "前向きな動機が伝わるかを判定します。",
    advice: "志望理由や自己PRは前向きな言葉で締めましょう。",
    weight: 2,
    evaluate: (context) => context.positiveWordCount > context.negativeWordCount
  },
  {
    rubricId: 222,
    id: "style.formatting",
    group: "文体_表現_マイナスチェック",
    label: "体裁整備",
    description: "段落改行や余白が整っているかを確認します。",
    advice: "段落冒頭に全角スペースを入れ、余白で読みやすさを高めましょう。",
    weight: 1,
    evaluate: (context) => context.indentRatio >= 0.5 || context.blankLineCount >= Math.max(1, context.paragraphs.length - 1)
  },
  {
    rubricId: 223,
    id: "style.finalReview",
    group: "文体_表現_マイナスチェック",
    label: "最終チェック済",
    description: "全体を見直した痕跡があるかを判定します。",
    advice: "投稿前に第三者視点でチェックしたかメタメッセージを添えましょう。",
    weight: 1,
    evaluate: (context) => /見直し|チェック|推敲/.test(context.normalized)
  }
];

const rubricCatalog: RubricCriterion[] = [
  ...commonOverallImpression,
  ...contentEssential,
  ...motivationSpecific,
  ...gakuchikaSpecific,
  ...selfPrSpecific,
  ...styleAndLanguage
];

export function getApplicableCriteria(params: {
  focus: ReviewFocus;
  industry?: string;
  jobCategory?: string;
}): RubricCriterion[] {
  const { focus, industry, jobCategory } = params;
  return rubricCatalog.filter((criterion) => {
    if (criterion.focus && !criterion.focus.includes(focus)) {
      return false;
    }
    if (criterion.industries && criterion.industries.length > 0) {
      if (!industry) return false;
      if (!criterion.industries.map((value) => value.toLowerCase()).includes(industry.toLowerCase())) {
        return false;
      }
    }
    if (criterion.jobCategories && criterion.jobCategories.length > 0) {
      if (!jobCategory) return false;
      if (!criterion.jobCategories.map((value) => value.toLowerCase()).includes(jobCategory.toLowerCase())) {
        return false;
      }
    }
    return true;
  });
}

export function listAllRubricCriteria(): RubricCriterion[] {
  return [...rubricCatalog];
}

