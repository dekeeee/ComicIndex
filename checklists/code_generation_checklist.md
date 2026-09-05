# 🛠 Code Generation Checklist（コード生成・編集 直後セルフチェック）— Web（Next.js / Supabase / Python）版

**目的**: Claude が `.ts` `.tsx` `.sql` `.py` を**生成・編集した直後**に自分で通すチェックリスト。
ご主人様に「動作確認お願いします」と言う前のセルフゲート。

**使い方**: 該当する全カテゴリを目視チェック → 引っかかった項目は**修正してから報告**する。

---

## A. 共通

- [ ] 設計書（`docs/`）に無い機能・テーブル・エンドポイントを勝手に足していない
- [ ] 既存コードを読んでから書いた（同名・同責務のものが既にないか検索した）
- [ ] マジックナンバーが `lib/config.ts` / `config.py` / `shared/*.json` に集約されている
- [ ] 外部 API のレスポンスを内部型に変換してから使っている
- [ ] 空の関数・未使用 import・`console.log` / `print` デバッグ残骸が無い
- [ ] エラーは握りつぶさず、型付きの結果（`ApiResult` 等）か例外で伝えている
- [ ] 命名規則（CLAUDE.md）に沿っている

## B. TypeScript / Next.js（web/）

- [ ] `output: 'export'` を壊す機能を使っていない（SSR / ISR / Route Handler / Server Actions / `cookies()` / `headers()` / `dynamic = 'force-dynamic'`）
- [ ] 動的ルートに `generateStaticParams` と `dynamicParams = false` がある
- [ ] `'use client'` は状態・イベント・ブラウザ API を使うコンポーネントだけに付いている
- [ ] クライアントコンポーネントに service role key・Turnstile secret・楽天 App ID を渡していない
- [ ] `process.env.NEXT_PUBLIC_*` 以外の env をクライアントで参照していない
- [ ] `next/image` を外部 CDN 画像に使っていない（`<img loading="lazy" width height>`）
- [ ] 純粋ロジックはコンポーネント内ではなく `lib/` にあり、テストが同じコミットに含まれている
- [ ] `any` を使っていない（`unknown` + 絞り込み）
- [ ] `tsc --noEmit` と `eslint` が通る
- [ ] 広告・バナーコンポーネントはフラグ OFF で `null` を返す

## C. Edge Functions（supabase/functions/）

- [ ] 書き込みは service role クライアントで行い、anon クライアントで insert していない
- [ ] 入力を `_shared/validation.ts` で検証してから DB に触れている
- [ ] レート制限（`shared/rate-limits.json`）を通している
- [ ] `ip_hash` のみ保存し、生 IP をログ・テーブルに残していない
- [ ] CORS ヘッダを `_shared/response.ts` 経由で付けている
- [ ] 想定するステータスコード（400 / 403 / 404 / 409 / 429）が設計書と一致している
- [ ] 「正常系・Turnstile 失敗・レート制限超過」の 3 ケースのテストがある

## D. SQL（supabase/migrations/）

- [ ] 新規テーブルに RLS が有効化され、anon のポリシーが `select` のみ
- [ ] `is_adult` / `status` の絞り込みがポリシーに入っている
- [ ] 外部キーに `on delete` の方針が明記されている
- [ ] 検索・並び替えに使うカラムに index がある
- [ ] マイグレーションが冪等（`if not exists` / `create or replace`）で、ローカル `supabase db reset` が通る

## E. Python（pipeline/）

- [ ] 型ヒントが全関数に付いている。`mypy --strict` 相当で警告が無い
- [ ] 楽天 API 呼び出しに 1 秒以上の間隔とリトライがある
- [ ] シリーズ正規化は `shared/series-rules.json` を読み、規則をコードにハードコードしていない
- [ ] 再実行しても重複行が増えない（upsert キーを確認した）
- [ ] 差分処理（`content_hash`）で全件再計算していない
- [ ] `pytest` が通り、新規関数にテストがある

## F. 報告前

- [ ] 変更したファイル一覧と、確認してほしい動作を 1〜3 行で書ける
- [ ] 実行していないもの（ビルド・テスト・デプロイ）を「実行済み」と言っていない
