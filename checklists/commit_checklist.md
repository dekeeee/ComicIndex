# ✅ Commit Checklist（git commit 直前セルフチェック）— Web（Next.js / Supabase / Python）版

**目的**: `git commit` を実行する**直前**に通すゲート。動かないもの・秘密情報・設計書とのズレをリポジトリに入れない。

**使い方**: 全項目を実際に確認する。1 つでも落ちたら修正してから commit。

---

## A. 動作

- [ ] `web/`: `npm run lint` と `npm run typecheck` と `npm test` が通った（実行した出力を見た）
- [ ] `web/`: 変更がページに関わるなら `npm run build` が通り、`out/` が生成された
- [ ] `pipeline/`: `pytest` が通った
- [ ] `supabase/`: マイグレーションを変えたなら `supabase db reset` が通った
- [ ] Edge Function を変えたなら `supabase functions serve` でローカル呼び出しを 1 回以上した

## B. 秘密情報・安全

- [ ] `.env*` がコミット対象に入っていない（`git status` で確認）
- [ ] service role key / Turnstile secret / 楽天 App ID / GitHub token がソースに埋め込まれていない
- [ ] anon に書き込みを許す RLS ポリシーを追加していない
- [ ] 生 IP を保存・ログ出力するコードが無い
- [ ] 表紙画像などの外部素材ファイルをリポジトリに追加していない

## C. 設計書との整合

- [ ] 追加・変更したテーブル・カラム・Enum が `docs/comicomi-data-design.md` に反映されている
- [ ] 追加・変更した Edge Function の入出力・ステータスコードが `docs/comicomi-module-design.md` と一致している
- [ ] 機能の振る舞いを変えたなら `docs/comicomi-feature-spec.md` の該当 F-xx を更新した
- [ ] `shared/*.json` の規則を変えたなら TS と Python の両方のテストを回した

## D. 差分の質

- [ ] `git diff --stat` を見て、意図しないファイル（生成物・ロックファイルの無関係な変更・`out/`・`.venv`）が混ざっていない
- [ ] 1 コミット 1 目的。無関係な修正は分けた
- [ ] デバッグ用の `console.log` / `print` / `TODO: remove` が残っていない
- [ ] 削除したコードの参照元が残っていない（grep した）

## E. コミットメッセージ

- [ ] Conventional Commits（`feat:` `fix:` `chore:` `docs:` `refactor:` `test:` `ci:`）で始まる
- [ ] 1 行目は 50 文字前後で「何を」、本文に「なぜ」
- [ ] 作業者の口調・キャラクター・絵文字・愚痴を含んでいない
- [ ] 自動署名（`Generated with`、`Co-Authored-By`）を付けていない
