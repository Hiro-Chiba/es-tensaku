# ES-tensaku

## セットアップ手順

1. 依存パッケージをインストールします。
   ```bash
   npm install
   ```
2. `.env` を作成し、`DATABASE_URL` と `GEMINI_API_KEY` を設定します。`DATABASE_URL` は PostgreSQL (例: Neon) を指定してください。
3. Prisma のマイグレーションをデプロイしてデータベースにテーブルを作成します。
   ```bash
   npx prisma migrate deploy
   ```
4. 開発サーバーを起動します。
   ```bash
   npm run dev
   ```

## テスト

```bash
npm test
```
