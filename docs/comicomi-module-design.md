# comicomi モジュール設計書

機能仕様書（F-xx）をモジュール・コンポーネント・関数に分解する。
コード全文は書かない。シグネチャと責務・依存のみ。
型・Enum の定義は `comicomi-data-design.md` を参照。

---

## 1. web/lib（純粋ロジック・データアクセス）

### lib/config.ts

| 項目 | 内容 |
|---|---|
| 責務 | 環境変数の読み取りと設定値の集約。マジックナンバーの唯一の置き場 |
| 公開 | `config: AppConfig`（`supabaseUrl`, `supabaseAnonKey`, `turnstileSiteKey`, `rakutenAffiliateId`, `adsEnabled`, `affiliateBannersEnabled`, `similarDisplayCount = 12`, `tagPageSize = 48`, `reviewMinLength = 20`, `reviewMaxLength = 2000`, `nicknameMaxLength = 20`） |
| 依存 | なし |

### lib/types.ts

内部型定義。データ設計書の TypeScript 型セクションと同一内容。

### lib/supabase.ts

| 項目 | 内容 |
|---|---|
| 責務 | anon key の Supabase クライアント生成（閲覧専用） |
| 公開 | `createAnonClient(): SupabaseClient` |
| 依存 | `@supabase/supabase-js`, `config` |

### lib/data/works.ts

| 項目 | 内容 |
|---|---|
| 責務 | ビルド時の作品データ取得。`is_adult = false` かつ `status = published` のみ返す |
| 公開 | `fetchAllWorkSlugs(): Promise<string[]>`<br>`fetchWorkBySlug(slug): Promise<WorkDetail \| null>`（タグ・類似・購入リンク込み）<br>`fetchFeaturedWorks(limit): Promise<WorkSummary[]>` |
| 依存 | `supabase`, `types`, `ranking` |

### lib/data/reviews.ts

| 項目 | 内容 |
|---|---|
| 責務 | レビュー取得。ビルド時全件と、クライアント側の差分取得を両方担う |
| 公開 | `fetchReviewsForWork(workId): Promise<Review[]>`<br>`fetchReviewsSince(workId, sinceIso): Promise<Review[]>`<br>`fetchLatestReviews(limit): Promise<ReviewWithWork[]>` |
| 依存 | `supabase`, `types` |

### lib/data/tags.ts

| 項目 | 内容 |
|---|---|
| 責務 | タグと所属作品の取得 |
| 公開 | `fetchAllTags(): Promise<Tag[]>`<br>`fetchWorksByTag(slug, page): Promise<Paginated<WorkSummary>>` |
| 依存 | `supabase`, `pagination` |

### lib/ranking.ts

| 項目 | 内容 |
|---|---|
| 責務 | 注目作品スコア（直近 30 日のレビュー数 + 投票数）。純粋関数 |
| 公開 | `featuredScore(stats: WorkStats, now: Date): number`<br>`sortFeatured(works: (WorkSummary & WorkStats)[], now: Date): WorkSummary[]`（同点は `id` 昇順で安定） |
| 依存 | `types` |

### lib/pagination.ts

| 項目 | 内容 |
|---|---|
| 責務 | ページ分割計算 |
| 公開 | `paginate<T>(items: T[], page: number, size: number): Paginated<T>`<br>`pageCount(total, size): number` |
| 依存 | なし |

### lib/validation.ts

| 項目 | 内容 |
|---|---|
| 責務 | レビュー・投票入力のクライアント側バリデーション。Edge Function と同じ規則（`_shared/validation.ts` と規則を共有するため、ロジックは `shared/validation-rules.json` から読む） |
| 公開 | `validateReviewInput(input: ReviewInput): ValidationResult`<br>`validateNickname(s): ValidationResult` |
| 依存 | `config` |

### lib/api/reviews.ts / votes.ts / search.ts / reports.ts

| 項目 | 内容 |
|---|---|
| 責務 | Edge Function 呼び出しの薄いラッパー。`fetch` + エラー型変換 |
| 公開 | `postReview(input, turnstileToken): Promise<ApiResult<Review>>`<br>`voteSimilar(fromWorkId, toWorkId): Promise<ApiResult<void>>`<br>`searchWorks(q): Promise<ApiResult<SearchResult>>`<br>`registerWork(rakutenItemCode, title): Promise<ApiResult<{ work: WorkSummary }>>`<br>`reportReview(reviewId, reason): Promise<ApiResult<void>>` |
| 依存 | `config`, `types` |

### lib/markdown.ts

| 項目 | 内容 |
|---|---|
| 責務 | `content/*.md` を HTML に変換（ビルド時） |
| 公開 | `renderMarkdownFile(path): Promise<string>` |
| 依存 | `remark`, `remark-html` |

### lib/seo.ts

| 項目 | 内容 |
|---|---|
| 責務 | JSON-LD（`Book`, `Review`, `BreadcrumbList`）と OGP メタ生成 |
| 公開 | `workJsonLd(work: WorkDetail): object`<br>`workMetadata(work: WorkDetail): Metadata` |
| 依存 | `types` |

---

## 2. web/app（ページ）

| パス | ファイル | 責務 | 使用コンポーネント |
|---|---|---|---|
| `/` | `app/page.tsx` | トップ。新着レビュー・注目作品・注目タグ | `WorkCard`, `ReviewTeaser`, `TagChip`, `AdSlot` |
| `/works/[slug]` | `app/works/[slug]/page.tsx` | 作品ページ。`generateStaticParams`, `dynamicParams = false` | `WorkHeader`, `BuyLinks`, `SimilarWorks`, `ReviewList`, `ReviewForm`, `AdSlot`, `AffiliateBanner` |
| `/works/pending` | `app/works/pending/page.tsx` | 未ビルド作品の仮表示（クライアント描画、`?id=`） | `WorkHeader`, `ReviewList`, `ReviewForm` |
| `/tags` | `app/tags/page.tsx` | タグ一覧 | `TagChip` |
| `/tags/[slug]` | `app/tags/[slug]/page.tsx` | タグ別作品 1 ページ目 | `WorkCard`, `Pagination`, `AdSlot` |
| `/tags/[slug]/page/[n]` | `app/tags/[slug]/page/[n]/page.tsx` | 2 ページ目以降 | 同上 |
| `/search` | `app/search/page.tsx` | 検索（クライアント） | `SearchBox`, `SearchResults`, `WorkCard` |
| `/about` `/privacy` `/terms` `/contact` | `app/(static)/*/page.tsx` | 固定ページ | `Prose` |
| 共通 | `app/layout.tsx` | ヘッダー・フッター・アフィリエイト開示 | `SiteHeader`, `SiteFooter` |

---

## 3. web/components

| コンポーネント | 種別 | Props | 責務 |
|---|---|---|---|
| `SiteHeader` | server | なし | ロゴ・検索リンク・タグリンク |
| `SiteFooter` | server | なし | 固定ページリンク・アフィリエイト開示文 |
| `WorkCard` | server | `work: WorkSummary` | 表紙・タイトル・作者・レビュー数のカード |
| `WorkHeader` | server | `work: WorkDetail` | 作品ページ上部（表紙・書誌・タグ・あらすじ） |
| `BuyLinks` | server | `links: BuyLink[]` | 購入ボタン群。楽天 → Amazon → ストアの順 |
| `SimilarWorks` | server | `items: SimilarWork[], fromWorkId` | 類似カード一覧 + 各カードに `SimilarVoteButton` |
| `SimilarVoteButton` | client | `fromWorkId, toWorkId, initialCount` | 投票。楽観更新、409 時は投票済み表示 |
| `SuggestSimilarForm` | client | `fromWorkId` | 「他の作品を提案」検索 → 投票 |
| `ReviewList` | client | `workId, initialReviews: Review[], builtAt: string` | 初期はビルド時のレビュー、マウント後 `fetchReviewsSince` で追加。ネタバレ折りたたみ |
| `ReviewItem` | server | `review: Review` | 1 件表示 + `ReportButton` |
| `ReviewForm` | client | `workId, onPosted(review)` | 入力・Turnstile・送信。`validation` を使う |
| `ReportButton` | client | `reviewId` | 通報。理由選択 |
| `TagChip` | server | `tag: Tag` | タグリンク |
| `Pagination` | server | `current, total, hrefFor(n)` | ページャ |
| `SearchBox` | client | `onSearch(q)` | 入力・デバウンス |
| `SearchResults` | client | `result: SearchResult, onRegister(code, title), registering` | DB ヒットと楽天ヒットを分けて表示 |
| `AdSlot` | client | `placement: AdPlacement` | AdSense。`adsEnabled` false なら `null` を返す。高さ予約 |
| `AffiliateBanner` | server | `placement: AdPlacement` | `affiliate-banners.json` から該当バナーを表示 |
| `Prose` | server | `html: string` | Markdown HTML の描画枠 |
| `TurnstileWidget` | client | `onToken(token)` | Turnstile ラッパー |

---

## 4. supabase/functions（Edge Functions）

共通: `_shared/` に以下を置く。

| モジュール | 公開 | 責務 |
|---|---|---|
| `_shared/supabase-admin.ts` | `createAdminClient()` | service role クライアント |
| `_shared/iphash.ts` | `ipHash(req: Request): string` | `sha256(ip + IP_HASH_SALT)` |
| `_shared/turnstile.ts` | `verifyTurnstile(token, ip): Promise<boolean>` | siteverify 呼び出し |
| `_shared/ratelimit.ts` | `checkRateLimit(kind: PostKind, ipHash, limits: RateLimit[]): Promise<RateLimitResult>` | `post_log` を数えて判定し、通過時に記録 |
| `_shared/ngwords.ts` | `containsNgWord(text): boolean`, `countUrls(text): number` | スパム判定 |
| `_shared/validation.ts` | `validateReviewInput(input): ValidationResult` | `shared/validation-rules.json` を読む。フロントと同規則 |
| `_shared/response.ts` | `json(status, body)`, `error(status, code, message)` | CORS 付きレスポンス |
| `_shared/rakuten.ts` | `searchRakutenBooks(q): Promise<RakutenItem[]>` | 楽天 API 呼び出し（Edge 用） |
| `_shared/amazon.ts` | `normalizeIsbn(raw)`, `isbn13ToIsbn10(isbn13)`, `buildAmazonUrl(isbn, tag): string \| null` | ISBN → Amazon アソシエイト商品 URL。Python `amazon_link.py` と同規則 |

各関数:

| 関数 | メソッド | 入力 | 処理 | 出力 |
|---|---|---|---|---|
| `post-review` | POST | `{ workId, nickname?, body, rating, hasSpoiler, turnstileToken }` | Turnstile → validation → rate limit（3/h, 10/d）→ NG/URL 判定で status 決定 → insert | `201 { review }` / `400` / `403` / `429` |
| `vote-similar` | POST | `{ fromWorkId, toWorkId }` | 同一 ID 拒否 → 存在確認 → rate limit（30/h）→ insert（unique 違反は 409） | `201` / `400` / `404` / `409` / `429` |
| `report-review` | POST | `{ reviewId, reason }` | rate limit（10/h）→ insert（unique 違反は 409）→ count ≥ threshold なら `status = hidden` | `201 { hidden: boolean }` |
| `search-works` | GET | `?q=` | `pg_trgm` で DB 検索 → 3 件未満なら楽天検索（1 分 10 回制限）→ 両方返す | `200 { db: WorkSummary[], rakuten: RakutenCandidate[] }` |
| `register-work` | POST | `{ rakutenItemCode, title }` | 楽天 Books API は itemCode 検索が無いので `title` をヒントに再検索（ISBN 形式なら isbn 検索）→ `_shared/series.ts` で正規化 → `work_volumes` に既存なら `200 { work }` → 無ければ `works` へ `status = pending` で insert → `trigger-build` 呼び出し | `201 { work }` / `404`（楽天に無い） |
| `trigger-build` | POST（内部） | なし | `build_triggers` の最終時刻を見て 1 時間未満なら no-op、そうでなければ GitHub `repository_dispatch` | `200 { triggered }` |

全関数共通の追加ステータス: `405`（メソッド違い）、`502`（楽天 / GitHub 上流失敗）。`trigger-build` は `401`（内部トークン不一致）。`search-works` は楽天フォールバックがレート制限に掛かると部分結果ではなく `429` を返す。

`_shared/series.ts` は Python の `series_grouper` と同じ正規化規則を持つ（37タイトルで両言語の出力一致を確認済み）。**規則は `shared/series-rules.json` に置き両言語から読む**（二重実装のズレ防止）。

---

## 5. pipeline/comicomi_pipeline（Python）

| モジュール | 公開 | 責務 | 依存 |
|---|---|---|---|
| `config.py` | `Settings`（env 読み取り）, `SIMILARITY_WEIGHTS`, `SAME_AUTHOR_PENALTY = 0.1`, `TOP_K = 20`, `RAKUTEN_INTERVAL_SEC = 1.0` | 設定集約 | pydantic-settings |
| `models.py` | `Work`, `Volume`, `Tag`, `WorkTag`, `SimilarityRow` | 内部型（dataclass） | なし |
| `rakuten_client.py` | `RakutenClient.search(genre_id, page) -> list[RakutenItem]`, `.item(item_code) -> RakutenItem` | API 呼び出し・間隔制御・リトライ | httpx |
| `amazon_link.py` | `normalize_isbn(raw)`, `isbn13_to_isbn10(isbn13)`, `build_amazon_url(isbn, tag) -> str \| None`, `representative_isbn(work)` | ISBN → Amazon 商品 URL（PA-API 不使用）。`ingest.build_works` が `affiliate_url_amazon` に入れる | なし |
| `series_grouper.py` | `normalize_title(title) -> str`, `extract_volume(title) -> int \| None`, `series_key(item) -> str`, `group_volumes(items) -> list[Work]` | 巻 → シリーズ。`shared/series-rules.json` の規則を使う | なし |
| `adult_filter.py` | `is_adult(item) -> bool` | ジャンル ID・NG ワード判定 | `config` |
| `tagger.py` | `tags_for_work(work) -> list[WorkTag]` | ジャンル変換 + キーワード規則（`tag_rules.yaml`） | pyyaml |
| `embedder.py` | `Embedder.embed_texts(texts) -> np.ndarray`, `build_embedding_text(work, tags) -> str`, `content_hash(text) -> str` | e5-small 推論。`"passage: "` プレフィックス付与 | sentence-transformers |
| `similarity.py` | `compose_score(cos, jaccard, votes, max_votes, same_author) -> float`, `tag_jaccard(a, b) -> float`, `top_k_similar(work_id, ...) -> list[SimilarityRow]` | スコア合成・上位抽出 | numpy |
| `repository.py` | `WorkRepository`（`upsert_works`, `fetch_works_needing_embedding`, `upsert_embeddings`, `replace_similarity`, `fetch_vote_counts`, `fetch_tags`） | Supabase（PostgREST / psycopg）アクセス | supabase-py or psycopg |
| `ingest.py` | `run_ingest(genre_ids, max_pages)` | F-01/F-02 の実行 | 上記 |
| `recompute.py` | `run_recompute(only_changed=True)` | F-03 の実行 | 上記 |
| `cli.py` | `comicomi ingest`, `comicomi recompute`, `comicomi all` | エントリポイント | typer |

---

## 6. 依存関係グラフ

```
config / types / shared-json
   ↓
lib/supabase → lib/data/* → app/* (静的ページ)
   ↓
lib/validation → components/ReviewForm → lib/api/reviews → functions/post-review
                 components/SimilarVoteButton → lib/api/votes → functions/vote-similar
                 components/ReportButton → lib/api/reports → functions/report-review
                 components/SearchBox → lib/api/search → functions/search-works → functions/register-work → functions/trigger-build

pipeline: config → models → rakuten_client → series_grouper / adult_filter → tagger → repository (ingest)
                                             embedder → similarity → repository (recompute)
```

## ローカルデモ

`lib/demo.ts` に localStorage リポジトリ（storage注入可能）、候補カタログ、API互換の操作処理を集約。`api/client.ts` は明示デモフラグで分岐。クライアントのレビュー差分・仮作品・投票状態も同リポジトリを参照。`DemoBanner` が状態の説明と初期化を提供。

### BookCover

画像URLがある場合は直接参照、ない場合は中立な「表紙なし」枠を表示する共通表示コンポーネント。WorkCard/WorkHeaderで利用。外部データアクセスや保存処理は持たない。
