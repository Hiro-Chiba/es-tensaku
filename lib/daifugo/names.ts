const familyNames = [
  "佐藤",
  "鈴木",
  "高橋",
  "田中",
  "伊藤",
  "渡辺",
  "山本",
  "中村",
  "小林",
  "加藤",
  "吉田",
  "山田",
  "佐々木",
  "山口",
  "松本",
  "井上",
  "木村",
  "林",
  "清水",
  "山崎"
];

const givenNames = [
  "太郎",
  "葵",
  "大輔",
  "優奈",
  "悠人",
  "花",
  "蓮",
  "陽菜",
  "蒼",
  "さくら",
  "航",
  "結衣",
  "颯太",
  "愛",
  "翼",
  "美咲",
  "陽斗",
  "凛",
  "健太",
  "琴音"
];

export function generateJapaneseNpcName(usedNames: Set<string>, random = Math.random): string {
  for (let i = 0; i < familyNames.length * givenNames.length; i += 1) {
    const family = familyNames[Math.floor(random() * familyNames.length)];
    const given = givenNames[Math.floor(random() * givenNames.length)];
    const name = `${family} ${given}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  // fallback to numbered NPC
  let suffix = usedNames.size + 1;
  let fallback = `NPC${suffix}`;
  while (usedNames.has(fallback)) {
    suffix += 1;
    fallback = `NPC${suffix}`;
  }
  usedNames.add(fallback);
  return fallback;
}
