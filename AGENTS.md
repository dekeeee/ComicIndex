# comicomi — AGENTS.md

## プロジェクト概要

漫画のレビュー・口コミ投稿サイト。作品ごとに「似ている漫画」をつないで辿れるのが差別化点。
収益はアフィリエイト（楽天ブックス／電子書籍ストア案件／将来 Amazon）と控えめなバナー広告。
**運用コストはドメイン代以外ゼロ**（全サービス無料枠）を絶対条件とする。

設計書は `docs/` 配下。実装前に必ず該当書類を読むこと。

- `docs/comicomi-feature-spec.md` — 機能仕様書（What / Why / 制約 / テスト観点）
- `docs/comicomi-module-design.md` — モジュール設計書（責務・公開API・依存）
- `docs/comicomi-page-ui-flow.md` — ページ・UI遷移図
- `docs/comicomi-data-design.md` — データ設計書（DBスキーマ・型・Enum）

## 技術スタック

| 層 | 採用 | 備考 |
|---|---|---|
| フロント | Next.js 15（App Router）+ TypeScript + Tailwind CSS | `output: 'export'` の**静的書き出し**。SSR・ISR・Route Handler は使わない |
| ホスティング | Cloudflare Pages | 商用可・帯域無制限。Workers 上の SSR は CPU 制限のため不採用 |
| DB | Supabase（PostgreSQL + pgvector） | 無料枠 500MB。閲覧は anon key + RLS、書き込みは Edge Functions 経由のみ |
| 書き込みAPI | Supabase Edge Functions（Deno / TypeScript） | レビュー投稿・類似投票・通報・楽天検索プロキシ・ビルド起動 |
| バッチ | Python 3.12（`pipeline/`） | 楽天API取込・埋め込み計算・類似スコア算出。ローカル or GitHub Actions で実行 |
| 埋め込み | `intfloat/multilingual-e5-small`（ローカル推論、384次元） | 有料APIは使わない |
| CI/CD | GitHub Actions | push 時 + 毎日 03:00 JST に「パイプライン → ビルド → デプロイ」 |
| Bot対策 | Cloudflare Turnstile | 投稿フォームに非表示ウィジェット |
| 外部データ | 楽天ブックス書籍検索API、openBD | 表紙画像は API が返す URL を直接参照。自前保存禁止 |

## ディレクトリ構成

```
comicomi/
├── AGENTS.md
├── docs/                      # 設計書
├── checklists/                # セルフチェック
├── web/                       # Next.js アプリ
│   ├── app/                   # App Router（ページ）
│   ├── components/            # UI コンポーネント
│   ├── lib/                   # 純粋ロジック・Supabase クライアント・型
│   ├── content/               # 固定ページ本文（Markdown）
│   └── tests/                 # vitest
├── supabase/
│   ├── migrations/            # SQL マイグレーション
│   ├── functions/             # Edge Functions（1関数1ディレクトリ）
│   └── seed/                  # 開発用シード
├── pipeline/                  # Python バッチ
│   ├── comicomi_pipeline/     # パッケージ本体
│   └── tests/                 # pytest
└── .github/workflows/
```

## アーキテクチャ方針

- **読み取りは静的、書き込みは Edge Function**。ページはビルド時に Supabase から全データを取り出して HTML 化する。ビルド後に増えたレビューはクライアント側で anon key を使って追加取得する。
- **ブラウザから DB へ直接 INSERT / UPDATE させない**。RLS で anon は SELECT のみ。書き込みは全て Edge Function が service role で行う。
- **類似スコアはバッチで事前計算**して `work_similarity` テーブルに保存する。ページ表示時にベクトル演算はしない。
- **純粋ロジックは `web/lib/` と `pipeline/comicomi_pipeline/` に閉じ込め、UI と I/O から分離する**。テストはここに集中させる。
- 外部 API のレスポンスはそのまま使わず、`lib/types.ts` / `models.py` の内部型に変換してから扱う。
- 成人向け作品は取込段階で除外する（`is_adult = true` を保存はするがビルド対象から外す）。広告審査対策。
- 設定値（レート制限・類似スコアの重み・広告スロット ON/OFF）はコード内マジックナンバーにせず `lib/config.ts` / `config.py` に集約する。

## ローカル開発・ビルドの前提

- 静的書き出しは「動的ルートのパラメータ0件」を許さない。**ビルドには Supabase 接続か `NEXT_PUBLIC_USE_FIXTURES=true`（`npm run build:fixtures` / `dev:fixtures`）が必要**。フィクスチャは `web/lib/fixtures.ts`
- どのタグも2ページ目に達しないときは `/tags/_/page/2` という 404 用プレースホルダを1件出す（仕様どおりの回避策）
- `shared/*.json` を変えたら `node scripts/sync-shared.mjs` で `web/shared/` と `supabase/functions/_shared/rules/` に同期する（コピーは commit する）
- Python パイプラインは `pipeline/.venv`（ローカルは 3.10、CI は 3.12）。テストは `pipeline/.venv/Scripts/python -m pytest pipeline/tests`
- この PC に supabase CLI / Docker / Deno は無い。Edge Function のテストは CI か supabase CLI 導入後に回す

## 命名規則

- TypeScript: ファイルは `kebab-case.ts(x)`、コンポーネントは `PascalCase`、関数・変数は `camelCase`、型・インターフェースは `PascalCase`（`I` プレフィックス無し）
- Python: モジュール `snake_case.py`、クラス `PascalCase`、関数 `snake_case`
- DB: テーブル・カラムは `snake_case` 複数形テーブル名（`works`, `reviews`）。外部キーは `<単数>_id`
- Edge Functions: ディレクトリ名 `kebab-case`（`post-review`, `vote-similar`）
- 環境変数: `NEXT_PUBLIC_` は公開して良いものだけ（Supabase URL / anon key / Turnstile site key / 楽天 affiliate ID）。secret はビルドとEdge Functionにのみ渡す

## CCへの制約（禁止事項）

- Next.js の SSR / ISR / Route Handler / Server Actions を使わない（静的書き出しが壊れる）
- Vercel にデプロイしない（無料プランは商用不可）
- 有料 API（OpenAI 埋め込み等）を導入しない。無料枠を超える構成変更は先に相談する
- 表紙画像をダウンロードしてリポジトリや Storage に保存しない
- ブラウザに service role key や Turnstile secret を露出しない
- `is_adult = true` の作品をページ生成・検索結果・類似候補に出さない
- 設計書に無い機能を勝手に追加しない。必要なら先に設計書を更新して確認を取る
- コミットメッセージ・PR には作業者の口調やキャラクター要素を入れない。Conventional Commits（`feat:` `fix:` `chore:` `docs:` `refactor:` `test:`）で淡々と書く

## セルフチェック義務（必須）

CCはコード生成・コミットの各タイミングで以下のchecklistを必ず通すこと。
引っかかった項目は修正してから報告する。

- **コード生成・編集直後**: `@./checklists/code_generation_checklist.md`
- **`git commit` 直前**: `@./checklists/commit_checklist.md`

checklistを「読んだ」だけで満足しないこと。各項目を実際に検証し、引っかかったら修正してから次に進む。

## テスト方針

### 3段階テスト

| 段階 | 内容 | 単位 | ツール |
|---|---|---|---|
| 単体テスト | 純粋ロジックを関数単位で検証 | `web/lib/`, `pipeline/` の関数ごと | vitest / pytest |
| 結合テスト | Supabase ローカル + Edge Function + フロントを組み合わせて動かす | 機能グループごと | `supabase start` + vitest（fetch） |
| 通しテスト | ビルド → 作品ページ閲覧 → レビュー投稿 → 投票 → 再ビルド反映 | リリース単位 | 手動 + Playwright（[TBD]） |

### テスト必須ルール

- **`web/lib/` と `pipeline/` に関数を追加したら、同じコミットでテストを追加する**（テストなし実装禁止）
- Edge Function には最低限「正常系1件・Turnstile失敗・レート制限超過」の3ケースを用意する
- UI コンポーネントの見た目はテスト対象外。ロジックをコンポーネントに書かず `lib/` に逃がす

### テストフォルダ構成

```
web/tests/
├── unit/           # lib/ の純粋ロジック
└── integration/    # Supabase ローカルを使うもの
pipeline/tests/     # pytest
supabase/functions/<name>/test.ts   # Edge Function ごと
```

## 実装推奨順序

1. **足場**: `web/` を Next.js 静的書き出し + Tailwind で初期化、`lib/config.ts` `lib/types.ts` を先に置く
2. **DB**: `supabase/migrations/0001_init.sql`（全テーブル・pgvector・RLS）、ローカル起動確認
3. **取込パイプライン**: 楽天API → 巻をシリーズにまとめて `works` へ upsert（pytest: タイトル正規化・シリーズ判定）
4. **類似パイプライン**: 埋め込み計算 → `work_embeddings`、スコア合成 → `work_similarity`（pytest: スコア合成式）
5. **閲覧系ページ**: 作品ページ・トップ・タグ一覧を静的生成（`generateStaticParams`）
   - **結合テスト①**: 50作品を取り込んでビルドし、作品ページから類似作品を辿れること
6. **レビュー投稿**: Edge Function `post-review`（Turnstile 検証・レート制限・NGワード）+ 投稿フォーム + クライアント側追加取得
7. **類似投票・通報**: Edge Function `vote-similar` `report-review` + UI
   - **結合テスト②**: 投稿 → 表示 → 通報しきい値で非表示、投票 → 再計算で順位が動くこと
8. **検索**: Edge Function `search-works`（DB 全文検索 → ヒット無しなら楽天API → 新規作品を pending 登録）+ 検索ページ
9. **固定ページ・収益枠**: about / privacy / terms / contact、`AdSlot`、`AffiliateBanner`（フラグで OFF 可）
10. **CI/CD**: GitHub Actions（push + 夜間）→ pipeline → build → Cloudflare Pages deploy、Edge Function `trigger-build`
   - **通しテスト**: 本番相当で「新規作品検索登録 → 夜間ビルド → ページ生成 → 投稿 → 投票」を1周

各ステップでテストを合格させてから次へ進む。

## スキル連携

### スキル使用時の表示ルール（必須）

スキルを使用する際は、**必ずレスポンスの冒頭に以下のフォーマットで表示する**こと。

```
🛠 使用スキル: [スキル名]
```

複数スキルを使う場合はすべて列挙する。

### スキル自動起動ルール

以下のスキルはトリガー条件に合致した時点で、ユーザーへの確認・報告なしに即座に起動すること。

- **bug-report-gen**: エラーメッセージ、ビルドエラー、「動かない」「エラーが出た」「バグがある」「おかしい」等のバグ報告があった時点で即起動
- **playtest-log-gen**: 「触ってみた」「なんか違う」「使いにくい」「見づらい」等の使用感フィードバックがあった時点で即起動

「使いました」の報告は不要。冒頭の `🛠 使用スキル:` 表示のみ行う。
