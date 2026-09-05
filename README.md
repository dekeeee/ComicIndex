# comicomi

漫画のレビュー・口コミを投稿し、似ている漫画をたどるサイト。

- 設計: `docs/`（機能仕様・モジュール設計・データ設計・ページ遷移）
- 運用ルール: `CLAUDE.md`

## 構成

| ディレクトリ | 内容 |
|---|---|
| `web/` | Next.js（静的書き出し）→ Cloudflare Pages |
| `supabase/` | マイグレーション・Edge Functions |
| `pipeline/` | Python バッチ（楽天取込・埋め込み・類似計算） |
| `shared/` | TS / Python 共通のルール JSON（`scripts/sync-shared.mjs` で配布） |

## ローカルで動かす

```bash
cd web && npm install && npm run dev:fixtures
```

`dev:fixtures` はサンプルデータで動く。実データは `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を置いて `npm run dev`。

```bash
cd web && npm run lint && npm run typecheck && npm test && npm run build:fixtures
```

## パイプライン

```bash
python -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install --index-url https://download.pytorch.org/whl/cpu torch
pipeline/.venv/Scripts/python -m pip install -e pipeline
pipeline/.venv/Scripts/comicomi ingest --genre 001001 --max-pages 5
pipeline/.venv/Scripts/comicomi recompute
```

環境変数は `.env.example` を参照。

## デプロイ

`.github/workflows/deploy.yml` が main への push、毎日 03:00 JST、`content-updated` dispatch で「パイプライン → ビルド → Cloudflare Pages」を実行する。必要な secrets / vars は同ファイルを参照。

## ローカル操作デモ（アカウント不要）

`cd web` → `npm run dev:demo` → http://127.0.0.1:3000 。作品名・作者で候補を絞り、月あかりの図書館／海辺の冒険者を追加できます。レビュー・投票・通報はブラウザに保存。購入ボタンはダミー、ランキングと類似順は固定です。上部の「デモをリセット」でやり直せます。静的ビルドは `npm run build:demo`。`dev` / `build` は通常モードです。デモの作品は実在書籍の一覧ではありません。
