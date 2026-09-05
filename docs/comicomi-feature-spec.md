# comicomi 機能仕様書

MVP（初回リリース）の機能を What / Why / 制約 / テスト観点で定義する。
関連モジュールは `comicomi-module-design.md`、データは `comicomi-data-design.md` を参照。

## 前提・共通制約

- 運用コストはドメイン代以外ゼロ。Supabase / Cloudflare Pages / GitHub Actions / Turnstile の無料枠内に収める
- 閲覧ページは全て静的 HTML（ビルド時生成）。書き込みは Edge Function 経由
- 表紙画像は楽天APIが返す URL を参照するのみ
- 成人向け作品（`is_adult`）は全機能から除外
- ページの基本単位は「作品（シリーズ）」。巻ごとのページは作らない

---

## F-01 作品DB取込（楽天ブックス）

**What**
楽天ブックス書籍検索APIからコミックを取得し、巻単位のアイテムを「作品（シリーズ）」にまとめて `works` に保存する。表紙・著者・出版社・あらすじ・発売日・楽天アフィリエイトURLを保持する。

**Why**
無料で書誌・表紙・アフィリエイトURLを一括取得できる唯一の現実的な情報源。作品ページの土台。

**制約**
- 楽天API はリクエスト間隔 1 秒以上を守る（無料枠のマナー、429 回避）
- 巻→シリーズの判定はタイトル正規化ルール（末尾の巻数・「(N)」「N巻」「第N巻」除去、全角半角統一）で行う。判定に自信が無いものは `series_confidence` を下げ、手動確認対象にする
- 成人向けジャンルID・NGワードに該当する作品は `is_adult = true`
- 初期投入はジャンル別に上位 N 件（合計 [TBD: 500〜2000] 作品目標）。追加は F-07 の検索登録から増える
- 再実行しても重複しない（`rakuten_series_key` で upsert）
- Amazon リンクは API を使わず、代表巻（最小巻）の ISBN-13 を ISBN-10 に変換して `https://www.amazon.co.jp/dp/<ISBN-10>?tag=<AMAZON_ASSOCIATE_TAG>` を組み立てて `affiliate_url_amazon` に保存する。タグ未設定・ISBN 無し・979 始まり（ISBN-10 に変換不能）は null（ボタン非表示）。F-07 の登録経路も同じ規則

**関連モジュール**
`pipeline.rakuten_client`, `pipeline.series_grouper`, `pipeline.amazon_link`, `pipeline.ingest`

**テスト観点**
- 巻タイトルからシリーズ名を正しく抽出できるか（代表的な表記ゆれ 10 パターン以上）
- 同一シリーズの複数巻が 1 レコードにまとまるか
- 2 回実行しても件数が増えないか
- 成人向け判定が効いているか
- ISBN-13 → ISBN-10 変換（チェックディジット X を含む）と、タグ未設定時に null になるか

---

## F-02 タグ付け

**What**
作品にジャンル・テーマ・ムードのタグを付ける。初期タグは楽天ジャンルからの自動変換 + あらすじからのキーワードルール。将来はユーザー提案タグ（スコープ外）。

**Why**
類似計算の材料であり、タグ一覧ページとして SEO の入口にもなる。

**制約**
- タグは `category`（genre / theme / mood / setting）を持つ。同名タグでも category が違えば別物
- 自動付与タグは `weight < 1.0`、手動確認済みは `1.0`
- タグ辞書（キーワード → タグ）は `pipeline/comicomi_pipeline/tag_rules.yaml` で管理

**関連モジュール**
`pipeline.tagger`

**テスト観点**
- 楽天ジャンルID → タグ変換表が漏れなく動くか
- キーワードルールが複数マッチしたとき重複せずに付くか

---

## F-03 類似作品スコア算出

**What**
作品ごとに「似ている作品」上位 20 件を事前計算し `work_similarity` に保存する。スコアは以下を合成する。

```
score = w_embed * cos_sim_norm + w_tag * tag_jaccard + w_vote * vote_norm
既定: w_embed 0.5 / w_tag 0.2 / w_vote 0.3
vote_norm = log(1 + votes) / log(1 + max_votes_in_dataset)
```

埋め込みは `title + authors + tags + synopsis` を `multilingual-e5-small` でベクトル化（384次元）。

**Why**
サイトの差別化点。初日から動く「埋め込み＋タグ」と、育つほど強くなる「投票」の二段構え。

**制約**
- 埋め込みは内容が変わった作品だけ再計算（`content_hash` 比較）
- 計算はバッチ（ローカル or GitHub Actions）。ページ表示時にベクトル演算しない
- 同一シリーズ・同一作者の作品はスコアにペナルティ（既定 -0.1）をかけ、上位が作者の別作品で埋まらないようにする
- 重みは `config.py` に集約

**関連モジュール**
`pipeline.embedder`, `pipeline.similarity`

**テスト観点**
- 合成式が既知の入力で期待値になるか
- 投票 0 件でも埋め込み・タグだけで順位がつくか
- 自分自身・成人向け作品が候補に含まれないか
- 同作者ペナルティが効くか

---

## F-04 作品ページ

**What**
`/works/[slug]` に作品情報・購入リンク・類似作品リスト・レビュー一覧・投稿フォームを表示する静的ページ。

**Why**
サイトの中心。SEO の着地点であり、アフィリエイトの導線。

**制約**
- ビルド時に Supabase から全作品を取得して `generateStaticParams` で生成
- 購入リンクは楽天（必須）、Amazon（URL があれば）、電子書籍ストアバナー（設定 JSON にあれば）の順
- 類似作品は上位 12 件をカード表示。各カードに「似てる」投票ボタン（F-08）
- レビューはビルド時点のものを HTML に埋め、マウント後に「ビルド以降の新着」を anon key で追加取得
- ネタバレ付きレビューは本文を折りたたみ表示
- 構造化データ（`Book` / `Review` の JSON-LD）を出力
- OGP 画像は表紙 URL を使う

**関連モジュール**
`app/works/[slug]/page.tsx`, `components/WorkHeader`, `components/BuyLinks`, `components/SimilarWorks`, `components/ReviewList`, `components/ReviewForm`, `lib/data/works`, `lib/data/reviews`

**テスト観点**
- 作品データが無いスラッグでビルドが落ちないか（`dynamicParams = false`）
- 購入リンクの優先順位・表示条件
- JSON-LD が有効な形式か
- 新着レビューの追加取得が既存と重複しないか

---

## F-05 トップページ

**What**
`/` に新着レビュー、レビュー数の多い作品、注目タグ、サイト説明を表示する。

**Why**
直帰させず作品ページへ流す入口。サイトの趣旨を伝える。

**制約**
- 全て静的。新着レビューはビルド時点のもの
- 「注目作品」の定義は直近 30 日のレビュー数 + 投票数（`lib/ranking.ts`）

**関連モジュール**
`app/page.tsx`, `components/WorkCard`, `lib/ranking`

**テスト観点**
- ランキング関数が同点時に安定した順序を返すか
- レビュー 0 件でも表示が壊れないか

---

## F-06 タグ一覧ページ

**What**
`/tags/[slug]` にそのタグを持つ作品一覧、`/tags` に全タグを表示する。

**Why**
「〇〇系 漫画」の検索流入と回遊。

**制約**
- 作品は `weight` 降順 → レビュー数降順
- 1 ページ 48 件でページ分割（`/tags/[slug]/page/[n]`）

**関連モジュール**
`app/tags/`, `lib/data/tags`, `lib/pagination`

**テスト観点**
- ページ分割の境界（0 件・48 件・49 件）

---

## F-07 作品検索・新規登録

**What**
`/search` でタイトル・作者を検索する。DB に無い場合は楽天APIを検索して結果を表示し、ユーザーが選ぶと `works` に `status = pending` で登録する。次回ビルドでページ化される。

**Why**
DB に無い作品にレビューを書きたい人を逃がさない。DB が利用者の手で育つ。

**制約**
- 検索は Edge Function `search-works`。DB 検索（`pg_trgm`）→ ヒット 3 件未満なら楽天API 検索
- 楽天API 呼び出しは Edge Function 内で実行し、アプリ ID をブラウザに出さない
- 新規登録された作品はページが無いため、検索結果から `/works/pending?id=` のクライアント描画ページで仮表示（レビュー投稿は可能）
- 登録後、Edge Function `trigger-build` を呼ぶ（1 時間に 1 回までのデバウンス）
- 楽天API 呼び出しは IP ごとに 1 分 10 回まで

**関連モジュール**
`app/search/page.tsx`, `app/works/pending/page.tsx`, `supabase/functions/search-works`, `supabase/functions/trigger-build`, `lib/api/search`

**テスト観点**
- DB ヒット時に楽天API を呼ばないか
- 同じ楽天アイテムを 2 回登録しても 1 レコードか
- デバウンスが効くか

---

## F-08 レビュー投稿・表示

**What**
匿名でレビュー（ニックネーム任意・本文・5 段階評価・ネタバレフラグ）を投稿する。Edge Function `post-review` が Turnstile 検証・レート制限・NGワード判定を行い保存する。

**Why**
UGC の中核。ログイン不要で投稿の敷居を下げる。

**制約**
- 本文 20〜2000 文字、ニックネーム 0〜20 文字（空なら「名無し」）
- Turnstile トークン必須。検証失敗は 403
- レート制限: `ip_hash` ごとに 1 時間 3 件、1 日 10 件（`post_log` テーブルで判定）
- `ip_hash = sha256(ip + IP_HASH_SALT)`。生 IP は保存しない
- NGワードは `supabase/functions/_shared/ngwords.ts`。該当は `status = pending`（公開せず保持）
- URL を 3 つ以上含む本文はスパム扱いで `pending`
- 投稿成功時はクライアント側で即時表示（楽観更新）

**関連モジュール**
`supabase/functions/post-review`, `supabase/functions/_shared/{turnstile,ratelimit,ngwords,iphash}`, `components/ReviewForm`, `lib/api/reviews`, `lib/validation`

**テスト観点**
- バリデーション境界（19 / 20 / 2000 / 2001 文字）
- Turnstile 失敗 → 403
- 4 件目 → 429
- NGワード → 保存されるが `pending`
- 生 IP がどのテーブルにも残らないこと

---

## F-09 「似てる」投票

**What**
作品ページの類似作品カード、および「他の作品を提案」入力から `similar_votes` に投票する。同一 `ip_hash` から同ペアへの投票は 1 回。

**Why**
類似精度を利用者の手で育てる。F-03 の `w_vote` に効く。

**制約**
- Edge Function `vote-similar`。Turnstile は不要（軽い操作）だが 1 時間 30 回制限
- 投票はペア非対称（A→B と B→A は別）。スコア計算時に両方向を合算
- 取り消しは MVP では不可（スコープ外）

**関連モジュール**
`supabase/functions/vote-similar`, `components/SimilarVoteButton`, `components/SuggestSimilarForm`, `lib/api/votes`

**テスト観点**
- 同ペア 2 回目が 409 で弾かれるか
- 存在しない作品 ID → 404
- 自分自身への投票 → 400

---

## F-10 通報・自動非表示

**What**
レビューに通報ボタンを置く。Edge Function `report-review` が `reports` に記録し、しきい値（既定 3）で `status = hidden` にする。

**Why**
匿名投稿の安全弁。管理画面無しでも荒らしを止められる。

**制約**
- 同一 `ip_hash` から同レビューへの通報は 1 回
- しきい値は `config` で変更可
- 非表示になった投稿は Supabase ダッシュボードで手動復帰（管理 UI はスコープ外）

**関連モジュール**
`supabase/functions/report-review`, `components/ReportButton`

**テスト観点**
- 3 件目で `hidden` になるか
- 同一人物の連投がカウントされないか

---

## F-11 固定ページ

**What**
`/about`（サイト説明）、`/privacy`（プライバシーポリシー・広告/アフィリエイト開示・Cookie）、`/terms`（利用規約・投稿ガイドライン）、`/contact`（Google フォーム等の外部リンク）。

**Why**
AdSense・ASP の審査必須要件。

**制約**
- 本文は `web/content/*.md` に Markdown で置き、ビルド時に変換
- アフィリエイト開示文（「当サイトはアフィリエイトプログラムに参加しています」）はフッター全ページ共通にも出す

**関連モジュール**
`app/(static)/`, `lib/markdown`

**テスト観点**
- Markdown → HTML 変換で見出し・リンクが崩れないか

---

## F-12 収益枠（広告・アフィリエイトバナー）

**What**
`AdSlot`（AdSense）と `AffiliateBanner`（ASP バナー）コンポーネント。配置は「作品ページ本文下」「サイドバー」「タグ一覧の下」の 3 か所のみ。追従・全画面・オーバーレイ広告は置かない。

**Why**
「邪魔しない広告」の方針。審査前・停止時に丸ごと OFF にできる必要がある。

**制約**
- `NEXT_PUBLIC_ADS_ENABLED`, `NEXT_PUBLIC_AFFILIATE_BANNERS_ENABLED` で ON/OFF
- バナー定義は `web/content/affiliate-banners.json`（ストア名・URL・画像 URL・表示条件）
- CLS 対策としてスロットは固定高さを予約する

**関連モジュール**
`components/AdSlot`, `components/AffiliateBanner`, `lib/config`

**テスト観点**
- フラグ OFF で DOM に何も出ないか
- スロットの高さ予約

---

## F-13 ビルド・デプロイ自動化

**What**
GitHub Actions で「pipeline（差分埋め込み・類似再計算）→ `next build` → Cloudflare Pages deploy」を実行する。トリガーは main への push、毎日 03:00 JST、`repository_dispatch`（`trigger-build` から）。

**Why**
静的サイトの鮮度を保つ。Supabase 無料枠の「1 週間無アクセスで一時停止」も夜間ジョブが防ぐ。

**制約**
- pipeline は差分のみ処理し 10 分以内に終わること
- ビルド失敗時は前回デプロイを維持（Pages の仕様通り）
- secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAKUTEN_APP_ID`, `CLOUDFLARE_API_TOKEN`, `GH_DISPATCH_TOKEN`（Edge Function 側は `AMAZON_ASSOCIATE_TAG` も `supabase secrets set` で渡す）

**関連モジュール**
`.github/workflows/deploy.yml`, `pipeline/comicomi_pipeline/cli.py`

**テスト観点**
- 差分ゼロのときパイプラインが即終了するか
- ビルドが失敗したときにデプロイ工程が走らないか

---

## スコープ外（第2弾以降）

- ユーザーアカウント・マイページ・読了記録
- 類似作品のグラフ可視化 UI
- ユーザー提案タグ
- ランキングページ（週間・月間）
- 管理画面（モデレーションは Supabase ダッシュボード）
- Amazon PA-API による Kindle 版リンク・価格取得（アソシエイト本審査通過後）
- 投票取り消し・レビュー編集
- 多言語対応

## F-14 ローカル操作デモ

2026-09-05 承認: 公開・アカウント登録なしで動作を試す。`npm run dev:demo` / `build:demo` で明示的に有効化し、fixtures とブラウザ localStorage を使用。作品名・作者入力後400msで候補表示、架空の未登録2作品を追加、仮作品ページでレビュー、既存作品に似てる投票・提案・通報を試せる。投稿・追加・投票は再読込後も保持し、専用リセットで削除可能。購入はダミーボタン。外部API、Turnstile、広告を呼ばない。本番の書込経路は変更しない。サンプルのランキングと類似順は固定。

検証: 保存の再読込、重複登録、逆方向の重複投票、入力不正、保存失敗、初期化、本番モードの分離を確認。
