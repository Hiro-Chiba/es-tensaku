# ES-tensaku

## セットアップ手順

1. `.env` を作成し、`DATABASE_URL` と `GEMINI_API_KEY` を設定します。`DATABASE_URL` は PostgreSQL (例: Neon) を指定してください。
2. 依存パッケージをインストールします。`DATABASE_URL` が設定されていれば、このステップで Prisma Client の生成とマイグレーション適用が自動で行われます。
   ```bash
   npm install
   ```
3. マイグレーションを手動でやり直す必要がある場合は、次のコマンドを実行します。
   ```bash
   npm run prisma:migrate
   ```
4. 開発サーバーを起動します。
   ```bash
   npm run dev
   ```

## テスト

```bash
npm test
```
