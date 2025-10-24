# ES-tensaku 機能実装計画書 (MVP)

## 1. プロジェクト概要
- **目的**: Gemini 2.5 Flash API を活用し、日本企業向けエントリーシートを即時に添削・フィードバックできる Next.js アプリを Vercel/Neon 上で提供する。
- **前提**: アカウント登録やログインを排し、誰でもすぐに利用できるワンページ体験を最優先する。
- **主要技術**: Next.js (App Router, TypeScript), Tailwind CSS, Prisma, Neon PostgreSQL, Vercel Serverless Functions, Gemini 2.5 Flash API。

## 2. MVP スコープ
1. **エントリーシート入力 & 設定 UI**
   - トップページにエントリーシート本文入力欄（Markdown対応テキストエリア）と、評価観点選択（プリセット3種: 志望動機, ガクチカ, 自己PR）。
   - 目標文字数など任意設定を追加入力できるオプション欄。

2. **添削リクエスト送信フロー**
   - クライアント側で入力検証（最低文字数、禁止語チェック）。
   - `POST /api/review` で entry sheet データを送信し、Neon に保存（匿名セッションIDで紐付け）。
   - API で Gemini 2.5 Flash を呼び出し、ストリームレスポンスで UI に反映。

3. **結果表示**
   - 総合スコア、評価サマリ、改善ポイントトップ3 をカード表示。
   - セクション別スコア (Content, Organisation, Language, Mechanics)。
   - インライン差分表示 (Before/After) とタグ付き指摘リスト。
   - Gemini から提案された改善例を折りたたみで表示。

4. **履歴 (軽量)**
   - 同一ブラウザ内で直近5件の添削履歴を IndexedDB にキャッシュし、再表示可能にする。

5. **運用補助**
   - リクエストごとの Gemini トークン使用量をログとして Neon に保存。
   - API キー保護のため Vercel 環境変数を使用し、リクエスト回数に簡易レートリミットを適用。

## 3. 非対象範囲
- アカウント登録/ログイン、OAuth、管理者ダッシュボード、長期的な学習プラン自動生成などの将来拡張は行わない。
- マルチテナントや外部共有リンク生成も対象外とする。

## 4. アーキテクチャ概要
```
[Client (Next.js Page)]
   |-- fetch (POST) --> [/api/review]
   |                      |-- Prisma --> [Neon PostgreSQL]
   |                      |-- GeminiService --> [Gemini 2.5 Flash API]
   |<-- Server-Sent Events / streaming JSON
```
- UI は主にクライアントコンポーネント。送信後はストリーミングで段階的に結果更新。
- `/api/review` は serverless function。Gemini との通信は structured prompt + SSE で実施。
- Prisma モデルは `ReviewSession`, `Essay`, `Evaluation`, `InlineIssue`, `TokenUsageLog` を中心に最小構成。

## 5. ES-tensaku ロジック
### 5.1 多段階評価
1. **前処理**: 言語判定、文字数集計、ビジネス上不適切な表現の抽出 (簡易辞書)。
2. **Gemini 呼び出し**: 以下の2モードで順次実行。
   - **Evaluation モード**: rubric (Content/Organisation/Language/Mechanics) に基づくスコア + 根拠生成。
   - **Rewrite モード**: 改善案とリライト提案を生成。必要に応じて sentence-level suggestions。
3. **統合**: Evaluation結果とRewrite結果をマージし、指摘リストを構築。矛盾検出用のセルフチェック (Gemini に JSON 検証を依頼) を挟む。
4. **信頼度補正**: Gemini 応答の `groundingMetadata` と前処理結果（文字数不足・表現チェック結果）を組み合わせ、confidence score を計算。

### 5.2 プロンプト戦略
- System Prompt: 「あなたは日本企業の採用に精通したキャリアアドバイザー。ビジネス文書として適切な日本語で建設的なフィードバックを行う」など固定。
- User Prompt: エントリーシート本文、ユーザ設定、企業情報、前処理結果サマリを含む。
- Output Schema: JSON (scores, issues, rewriteSuggestions, confidence) + Markdown (ユーザ向けまとめ) を要求。
- Self-critique Step: Gemini に JSON Schema 検証と矛盾指摘をさせ、必要に応じて再生成を行う。

### 5.3 後処理
- Inline Diff: sentence-level alignment + diff-match-patch を用いて差分を生成。
- Issue Tagging: 意図の明確さ、構成、表現、語調、形式面に分類。
- 推奨学習タスク: 弱点上位2カテゴリに対して Gemini から取得した学習アクションを提示。

## 6. データモデル (MVP)
- `ReviewSession`: id, sessionKey (Cookieベース), createdAt。
- `Essay`: id, sessionId, topic, content, characterCount, submittedAt。
- `Evaluation`: id, essayId, overallScore, sectionScores(JSONB), summaryMarkdown, confidence。
- `InlineIssue`: id, evaluationId, startIndex, endIndex, category, severity, message, suggestion。
- `TokenUsageLog`: id, evaluationId, mode, promptTokens, responseTokens, latencyMs。

## 7. 実装タスク一覧
| No. | カテゴリ | タスク | 詳細 | 成果物 |
| --- | --- | --- | --- | --- |
| T1 | Foundation | リポジトリ初期セットアップ | Next.js App Router, TypeScript, ESLint/Tailwind の導入 | ベースアプリ、CI設定 |
| T2 | Foundation | Prisma + Neon 接続設定 | Prisma schema 定義、Neon 接続、migrate | `schema.prisma`, `.env.example` |
| T3 | Core | 添削 API `/api/review` | 入力バリデーション、Gemini 呼び出し、結果ストリーミング | API ハンドラー、Gemini service module |
| T4 | Core | 前処理・後処理ロジック | 文字数計測、diff-match-patch、confidence 算出 | ユーティリティ群、テスト |
| T5 | Core | フロントエンド UI | 入力フォーム、進行状況表示、結果カード、履歴モーダル | ページ/コンポーネント |
| T6 | Core | IndexedDB 履歴保存 | ブラウザ内 5 件まで保存 | カスタムフック、ユーティリティ |
| T7 | Quality | 最低限のテスト | API ユニットテスト、Gemini モック、UI スナップショット | テストコード |
| T8 | Quality | モニタリング/レート制限 | 429 応答、TokenUsageLog 保存、ログ出力 | Rate limiter、ロガー |
| T9 | Delivery | Vercel デプロイ設定 | 環境変数設定、Neon URL 登録、動作確認 | `vercel.json`, デプロイ手順 |

## 8. リスクと対策 (MVP)
- **Gemini レスポンス遅延**: SSE でプログレッシブに表示し、タイムアウト時は再試行リンクを提示。
- **API キー漏洩**: サーバレス関数でのみ呼び出し、クライアントには一切露出しない。
- **コスト制御**: トークン使用量ログと1分あたりのリクエスト上限で対処。
- **大量リクエスト**: Cloudflare Turnstile や簡易クイズによるボット対策（必要時のみ）。

## 9. テスト & QA
- **単体テスト**: 前処理・後処理ロジック、Gemini サービスのモック呼び出し。
- **統合テスト**: API Route + Prisma を使った end-to-end フロー (Gemini をモック)。
- **UI テスト**: Playwright でフォーム送信～結果表示を確認（SSE モック）。
- **パフォーマンステスト**: k6 で `/api/review` に対する RPS を測定 (小規模)。

## 10. デプロイフロー
1. GitHub リポジトリと Vercel を連携。
2. `VERCEL_ENV`, `DATABASE_URL`, `GEMINI_API_KEY` をセット。
3. `prisma migrate deploy` を Vercel デプロイ前に実行。
4. Smoke テスト: フォーム送信 → 結果確認 → IndexedDB 履歴確認。
5. 問題なければ正式公開。
