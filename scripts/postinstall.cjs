const { execSync } = require("node:child_process");

function run(command, description) {
  console.log(`[postinstall] ${description}`);
  execSync(command, { stdio: "inherit" });
}

try {
  run("npx prisma generate", "Prisma Client を生成しています...");
} catch (error) {
  console.error("[postinstall] Prisma Client の生成に失敗しました。");
  throw error;
}

if (!process.env.DATABASE_URL) {
  console.warn("[postinstall] DATABASE_URL が未設定のため Prisma マイグレーションをスキップします。");
  return;
}

try {
  run("npx prisma migrate deploy", "Prisma マイグレーションを適用しています...");
} catch (error) {
  console.error(
    "[postinstall] Prisma マイグレーションの適用に失敗しました。DATABASE_URL と接続先を確認してください。"
  );
  throw error;
}
