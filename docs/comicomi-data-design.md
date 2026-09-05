# comicomi データ設計書

DB スキーマ（Supabase / PostgreSQL）、TypeScript 型、Python モデル、Enum、共有設定ファイルを定義する。
マイグレーションは `supabase/migrations/0001_init.sql` として起こす。

---

## 1. 拡張

```sql
create extension if not exists vector;      -- pgvector
create extension if not exists pg_trgm;     -- 検索
```

---

## 2. Enum

| Enum | 値 | 用途 |
|---|---|---|
| `work_status` | `pending`, `published`, `rejected` | pending = 利用者登録・未確認、published = ビルド対象、rejected = 除外 |
| `review_status` | `visible`, `pending`, `hidden` | pending = NGワード/URL 検出、hidden = 通報しきい値 |
| `tag_category` | `genre`, `theme`, `mood`, `setting` | |
| `post_kind` | `review`, `vote`, `report`, `search`, `register` | レート制限の種別 |
| `report_reason` | `spam`, `spoiler`, `abuse`, `copyright`, `other` | |
| `ad_placement`（TS のみ） | `work_bottom`, `sidebar`, `tag_bottom` | 広告・バナー配置 |

---

## 3. テーブル

### works（作品＝シリーズ）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| slug | text | unique, not null | URL 用。`w-` + sha1(`rakuten_series_key`) の先頭10桁（日本語 URL 回避。TS `_shared/series.ts` と Python `series_grouper` で同じ規則） |
| rakuten_series_key | text | unique, not null | 正規化タイトル + 主著者から作る安定キー |
| title | text | not null | シリーズ名（正規化後） |
| title_kana | text | | 楽天の `titleKana` |
| authors | text[] | not null default '{}' | |
| publisher | text | | |
| synopsis | text | | 第 1 巻の `itemCaption` |
| cover_url | text | | 第 1 巻の `largeImageUrl`（楽天 CDN） |
| first_sales_date | date | | |
| volume_count | int | not null default 1 | 取込時点の巻数 |
| affiliate_url_rakuten | text | not null | 楽天が返す `affiliateUrl` |
| affiliate_url_amazon | text | | 代表巻の ISBN-10 + `AMAZON_ASSOCIATE_TAG` から組み立て（`pipeline.amazon_link` / `_shared/amazon.ts`）。タグ未設定・ISBN 無しは null |
| is_adult | bool | not null default false | |
| status | work_status | not null default 'published' | |
| series_confidence | real | not null default 1.0 | シリーズ判定の確度 0〜1 |
| content_hash | text | | 埋め込み対象テキストのハッシュ |
| review_count | int | not null default 0 | トリガーで維持 |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

index: `(status, is_adult)`, `gin (title gin_trgm_ops)`, `gin (authors)`

### work_volumes（巻。表示には使わず、再取込の重複判定用）

| カラム | 型 | 制約 |
|---|---|---|
| rakuten_item_code | text | PK |
| work_id | uuid | FK works, not null |
| volume_no | int | |
| title_raw | text | not null |
| isbn | text | |
| sales_date | date | |
| affiliate_url | text | |

### tags

| カラム | 型 | 制約 |
|---|---|---|
| id | int | PK generated |
| slug | text | unique, not null |
| name | text | not null |
| category | tag_category | not null |
| unique (name, category) | | |

### work_tags

| カラム | 型 | 制約 |
|---|---|---|
| work_id | uuid | FK works on delete cascade |
| tag_id | int | FK tags on delete cascade |
| weight | real | not null default 1.0 |
| PK (work_id, tag_id) | | |

### work_embeddings

| カラム | 型 | 制約 |
|---|---|---|
| work_id | uuid | PK, FK works on delete cascade |
| embedding | vector(384) | not null |
| content_hash | text | not null |
| updated_at | timestamptz | default now() |

index: `hnsw (embedding vector_cosine_ops)`（バッチ側の近傍探索用。件数が少ないうちは無くても可）

### work_similarity（事前計算結果）

| カラム | 型 | 制約 |
|---|---|---|
| from_work_id | uuid | FK works on delete cascade |
| to_work_id | uuid | FK works on delete cascade |
| rank | smallint | not null |
| score | real | not null |
| score_embed | real | not null |
| score_tag | real | not null |
| score_vote | real | not null |
| PK (from_work_id, to_work_id) | | |

index: `(from_work_id, rank)`

### reviews

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK |
| work_id | uuid | FK works, not null |
| nickname | text | not null default '名無し', check length ≤ 20 |
| body | text | not null, check 20 ≤ length ≤ 2000 |
| rating | smallint | not null, check 1〜5 |
| has_spoiler | bool | not null default false |
| status | review_status | not null default 'visible' |
| ip_hash | text | not null |
| report_count | int | not null default 0 |
| created_at | timestamptz | default now() |

index: `(work_id, status, created_at desc)`, `(status, created_at desc)`

トリガー: insert / status 変更時に `works.review_count` を `visible` の件数で更新。

### similar_votes

| カラム | 型 | 制約 |
|---|---|---|
| id | bigint | PK generated |
| from_work_id | uuid | FK works |
| to_work_id | uuid | FK works |
| ip_hash | text | not null |
| created_at | timestamptz | default now() |
| unique (from_work_id, to_work_id, ip_hash) | | |
| check (from_work_id <> to_work_id) | | |

view `similar_vote_counts`: `(a, b, votes)` を `least/greatest` で両方向合算。

### reports

| カラム | 型 | 制約 |
|---|---|---|
| id | bigint | PK generated |
| review_id | uuid | FK reviews on delete cascade |
| reason | report_reason | not null |
| ip_hash | text | not null |
| created_at | timestamptz | default now() |
| unique (review_id, ip_hash) | | |

### post_log（レート制限）

| カラム | 型 | 制約 |
|---|---|---|
| id | bigint | PK generated |
| kind | post_kind | not null |
| ip_hash | text | not null |
| created_at | timestamptz | default now() |

index: `(kind, ip_hash, created_at desc)`。夜間パイプラインで 2 日より古い行を削除。

### build_triggers

| カラム | 型 |
|---|---|
| id | int PK（常に 1 行） |
| last_triggered_at | timestamptz |
| pending_count | int |

### reviews_public（view）

`reviews` は `ip_hash` を持つため anon には直接 select を与えない。`status = 'visible'` の行を `id, work_id, nickname, body, rating, has_spoiler, created_at` に絞って公開する view。web はレビュー取得を常にこの view から行う。

### similar_vote_counts_directed（view）

`similar_vote_counts`（両方向合算）を `from_work_id, to_work_id, votes` の向き付きに展開した view。作品ページの類似カードの投票数表示に使う。anon select 可。

### works_pending_public（view）

`/works/pending?id=` の仮表示用。`works` から `status = 'pending' and is_adult = false` の行だけを `id, slug, title, authors, cover_url, publisher, synopsis, affiliate_url_rakuten` に絞って公開する。anon に select を許可（`security_invoker = false`）。

---

## 4. RLS

| テーブル | anon | service role |
|---|---|---|
| works | select（`status = 'published' and is_adult = false`） | all |
| work_volumes | なし | all |
| tags / work_tags / work_similarity | select | all |
| work_embeddings | なし | all |
| reviews | なし（`reviews_public` view 経由で select） | all |
| reviews_public / similar_vote_counts / similar_vote_counts_directed（view） | select | all |
| similar_votes / reports / post_log / build_triggers | なし | all |
| works_pending_public（view） | select | all |

**anon に insert / update / delete は一切与えない。**

---

## 5. TypeScript 型（web/lib/types.ts）

```ts
type WorkStatus = 'pending' | 'published' | 'rejected'
type ReviewStatus = 'visible' | 'pending' | 'hidden'
type TagCategory = 'genre' | 'theme' | 'mood' | 'setting'
type ReportReason = 'spam' | 'spoiler' | 'abuse' | 'copyright' | 'other'
type AdPlacement = 'work_bottom' | 'sidebar' | 'tag_bottom'

interface Tag { id: number; slug: string; name: string; category: TagCategory }

interface WorkSummary {
  id: string; slug: string; title: string; authors: string[]
  coverUrl: string | null; reviewCount: number; status: WorkStatus
}

interface WorkDetail extends WorkSummary {
  titleKana: string | null; publisher: string | null; synopsis: string | null
  firstSalesDate: string | null; volumeCount: number
  tags: (Tag & { weight: number })[]
  buyLinks: BuyLink[]
  similar: SimilarWork[]
}

interface BuyLink { store: 'rakuten' | 'amazon' | 'ebook'; label: string; url: string; imageUrl?: string }

interface SimilarWork extends WorkSummary { rank: number; score: number; voteCount: number }

interface Review {
  id: string; workId: string; nickname: string; body: string
  rating: 1 | 2 | 3 | 4 | 5; hasSpoiler: boolean; createdAt: string
}
interface ReviewWithWork extends Review { work: WorkSummary }

interface ReviewInput { workId: string; nickname?: string; body: string; rating: number; hasSpoiler: boolean }

interface WorkStats { recentReviewCount: number; recentVoteCount: number }

interface Paginated<T> { items: T[]; page: number; pageCount: number; total: number }

interface RakutenCandidate { itemCode: string; title: string; author: string; imageUrl: string; salesDate: string }
interface SearchResult { db: WorkSummary[]; rakuten: RakutenCandidate[] }

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string }
type ValidationResult = { ok: true } | { ok: false; errors: Record<string, string> }

interface AffiliateBannerDef {
  id: string; store: string; url: string; imageUrl: string; alt: string
  placements: AdPlacement[]; enabled: boolean
}
```

---

## 6. Python モデル（pipeline/comicomi_pipeline/models.py）

```python
@dataclass
class RakutenItem:
    item_code: str; title: str; title_kana: str | None; author: str
    publisher: str | None; caption: str | None; image_url: str | None
    sales_date: str | None; isbn: str | None; affiliate_url: str; genre_ids: list[str]

@dataclass
class Volume:
    rakuten_item_code: str; work_key: str; volume_no: int | None
    title_raw: str; isbn: str | None; sales_date: date | None; affiliate_url: str

@dataclass
class Work:
    rakuten_series_key: str; slug: str; title: str; title_kana: str | None
    authors: list[str]; publisher: str | None; synopsis: str | None
    cover_url: str | None; first_sales_date: date | None; volume_count: int
    affiliate_url_rakuten: str; is_adult: bool; series_confidence: float
    volumes: list[Volume]

@dataclass
class WorkTag:
    work_key: str; tag_slug: str; category: str; weight: float

@dataclass
class SimilarityRow:
    from_work_id: str; to_work_id: str; rank: int
    score: float; score_embed: float; score_tag: float; score_vote: float
```

---

## 7. 共有設定ファイル（`shared/`、TS と Python の両方から読む）

### shared/series-rules.json

```json
{
  "volume_patterns": [
    "[\\s　]*[（(]\\s*(\\d+)\\s*[)）]\\s*$",
    "[\\s　]*第?\\s*(\\d+)\\s*巻\\s*$",
    "[\\s　]+(\\d+)\\s*$"
  ],
  "strip_patterns": ["【.*?】", "\\[.*?\\]", "（完）", "\\(完\\)"],
  "normalize": { "fullwidth_to_halfwidth": true, "collapse_spaces": true, "trim": true }
}
```

### shared/validation-rules.json

```json
{ "review": { "bodyMin": 20, "bodyMax": 2000, "nicknameMax": 20, "ratingMin": 1, "ratingMax": 5 } }
```

### shared/rate-limits.json

```json
{
  "review":   [{ "windowSec": 3600, "max": 3 }, { "windowSec": 86400, "max": 10 }],
  "vote":     [{ "windowSec": 3600, "max": 30 }],
  "report":   [{ "windowSec": 3600, "max": 10 }],
  "search":   [{ "windowSec": 60,   "max": 10 }],
  "register": [{ "windowSec": 3600, "max": 5 }]
}
```

### web/content/affiliate-banners.json

`AffiliateBannerDef[]`。初期は空配列。ASP 承認後に追記。

### pipeline/comicomi_pipeline/tag_rules.yaml

```yaml
genre_map:            # 楽天ジャンルID → タグ
  "001001001": { slug: shonen, name: 少年, category: genre }
  "001001002": { slug: shojo,  name: 少女, category: genre }
  "001001003": { slug: seinen, name: 青年, category: genre }
  # [TBD] 実際のジャンルID一覧を楽天 GenreSearch API で確認して埋める
adult_genre_ids: []   # [TBD]
adult_ng_words: []    # [TBD]
keyword_rules:        # あらすじ・タイトルのキーワード → タグ（weight 0.6）
  - { match: ["異世界", "転生"], slug: isekai, name: 異世界, category: theme }
  - { match: ["部活", "高校"], slug: school, name: 学園, category: setting }
  - { match: ["泣ける", "涙"], slug: tearjerker, name: 泣ける, category: mood }
  # 初期 30〜50 規則を想定
```

---

## 8. 環境変数

| 名前 | 公開 | 使う場所 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | 公開 | web |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | 公開 | web |
| NEXT_PUBLIC_TURNSTILE_SITE_KEY | 公開 | web |
| NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID | 公開 | web（表示用） |
| NEXT_PUBLIC_ADS_ENABLED / NEXT_PUBLIC_AFFILIATE_BANNERS_ENABLED | 公開 | web |
| NEXT_PUBLIC_ADSENSE_CLIENT | 公開 | web |
| SUPABASE_SERVICE_ROLE_KEY | secret | pipeline, functions |
| RAKUTEN_APP_ID / RAKUTEN_AFFILIATE_ID | secret | pipeline, functions |
| TURNSTILE_SECRET_KEY | secret | functions |
| IP_HASH_SALT | secret | functions |
| GH_DISPATCH_TOKEN / GH_REPO | secret | functions(trigger-build) |
| CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID | secret | GitHub Actions |

## ローカルデモの保存

`comicomi-demo-v1` に version=1、works（PendingWork + WorkSummary）、reviews（Review）、votes（IDをソートしたペア）、reports（レビューID）をJSON保存。本番DBと独立。追加候補は架空2作品、既存はfixtures6作品。
