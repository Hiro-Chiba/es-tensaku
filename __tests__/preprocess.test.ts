import { preprocessEssay } from "@/lib/preprocess";
import type { EssayInput } from "@/lib/types";

describe("preprocessEssay", () => {
  const baseEssay: EssayInput = {
    content:
      "私は大学で地域連携プロジェクトのリーダーを務め、課題設定から振り返りまでをチームで丁寧に行いました。" +
      "初期は意見がまとまらず苦戦しましたが、参加者アンケートをもとに議論を整理し、役割分担を明確化したことで、" +
      "最終的には前年よりも満足度を20ポイント高めることができました。" +
      "この経験を通じて培った傾聴力と改善力を、御社の企画職でも活かしたいと考えています。" +
      "また、PDCAサイクルを短期間で回すためにデータ分析ツールを学び直し、チーム全体に共有しました。",
    topic: "テスト応募先",
    settings: {
      focus: "gakuchika"
    },
    agreeToTerms: true
  };

  it("calculates character count and language", () => {
    const result = preprocessEssay(baseEssay);
    expect(result.characterCount).toBeGreaterThanOrEqual(200);
    expect(result.language).toBe("ja");
  });

  it("flags banned words", () => {
    const essay: EssayInput = {
      ...baseEssay,
      content: `${baseEssay.content}一部の表現としてバカという言葉を使用しました。`
    };
    const result = preprocessEssay(essay);
    expect(result.bannedWords).toContain("バカ");
  });

  it("throws when essay is too short", () => {
    const essay: EssayInput = {
      ...baseEssay,
      content: "志望動機をまとめています。",
      agreeToTerms: true
    };
    expect(() => preprocessEssay(essay)).toThrow("エントリーシートは200文字以上で入力してください。");
  });
});
