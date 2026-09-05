-- comicomi initial schema
-- See docs/comicomi-data-design.md

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type work_status as enum ('pending', 'published', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('visible', 'pending', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tag_category as enum ('genre', 'theme', 'mood', 'setting');
exception when duplicate_object then null; end $$;

do $$ begin
  create type post_kind as enum ('review', 'vote', 'report', 'search', 'register');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_reason as enum ('spam', 'spoiler', 'abuse', 'copyright', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists works (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  rakuten_series_key     text not null unique,
  title                  text not null,
  title_kana             text,
  authors                text[] not null default '{}',
  publisher              text,
  synopsis               text,
  cover_url              text,
  first_sales_date       date,
  volume_count           int not null default 1,
  affiliate_url_rakuten  text not null,
  affiliate_url_amazon   text,
  is_adult               boolean not null default false,
  status                 work_status not null default 'published',
  series_confidence      real not null default 1.0,
  content_hash           text,
  review_count           int not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists works_status_adult_idx on works (status, is_adult);
create index if not exists works_title_trgm_idx on works using gin (title gin_trgm_ops);
create index if not exists works_title_kana_trgm_idx on works using gin (title_kana gin_trgm_ops);
create index if not exists works_authors_idx on works using gin (authors);

create table if not exists work_volumes (
  rakuten_item_code  text primary key,
  work_id            uuid not null references works (id) on delete cascade,
  volume_no          int,
  title_raw          text not null,
  isbn               text,
  sales_date         date,
  affiliate_url      text
);
create index if not exists work_volumes_work_idx on work_volumes (work_id);

create table if not exists tags (
  id        int generated always as identity primary key,
  slug      text not null unique,
  name      text not null,
  category  tag_category not null,
  unique (name, category)
);

create table if not exists work_tags (
  work_id  uuid not null references works (id) on delete cascade,
  tag_id   int  not null references tags (id) on delete cascade,
  weight   real not null default 1.0,
  primary key (work_id, tag_id)
);
create index if not exists work_tags_tag_idx on work_tags (tag_id, weight desc);

create table if not exists work_embeddings (
  work_id       uuid primary key references works (id) on delete cascade,
  embedding     vector(384) not null,
  content_hash  text not null,
  updated_at    timestamptz not null default now()
);

create table if not exists work_similarity (
  from_work_id  uuid not null references works (id) on delete cascade,
  to_work_id    uuid not null references works (id) on delete cascade,
  rank          smallint not null,
  score         real not null,
  score_embed   real not null,
  score_tag     real not null,
  score_vote    real not null,
  primary key (from_work_id, to_work_id)
);
create index if not exists work_similarity_from_rank_idx on work_similarity (from_work_id, rank);

create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  work_id       uuid not null references works (id) on delete cascade,
  nickname      text not null default '名無し',
  body          text not null,
  rating        smallint not null,
  has_spoiler   boolean not null default false,
  status        review_status not null default 'visible',
  ip_hash       text not null,
  report_count  int not null default 0,
  created_at    timestamptz not null default now(),
  constraint reviews_nickname_len check (char_length(nickname) between 1 and 20),
  constraint reviews_body_len     check (char_length(body) between 20 and 2000),
  constraint reviews_rating_range check (rating between 1 and 5)
);
create index if not exists reviews_work_status_created_idx on reviews (work_id, status, created_at desc);
create index if not exists reviews_status_created_idx on reviews (status, created_at desc);

create table if not exists similar_votes (
  id            bigint generated always as identity primary key,
  from_work_id  uuid not null references works (id) on delete cascade,
  to_work_id    uuid not null references works (id) on delete cascade,
  ip_hash       text not null,
  created_at    timestamptz not null default now(),
  unique (from_work_id, to_work_id, ip_hash),
  constraint similar_votes_not_self check (from_work_id <> to_work_id)
);
create index if not exists similar_votes_pair_idx on similar_votes (from_work_id, to_work_id);

create table if not exists reports (
  id          bigint generated always as identity primary key,
  review_id   uuid not null references reviews (id) on delete cascade,
  reason      report_reason not null,
  ip_hash     text not null,
  created_at  timestamptz not null default now(),
  unique (review_id, ip_hash)
);

create table if not exists post_log (
  id          bigint generated always as identity primary key,
  kind        post_kind not null,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists post_log_lookup_idx on post_log (kind, ip_hash, created_at desc);

create table if not exists build_triggers (
  id                 int primary key,
  last_triggered_at  timestamptz,
  pending_count      int not null default 0
);
insert into build_triggers (id, last_triggered_at, pending_count)
  values (1, null, 0)
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
-- Votes are asymmetric on insert; scoring merges both directions.
create or replace view similar_vote_counts as
  select
    least(from_work_id, to_work_id)    as a,
    greatest(from_work_id, to_work_id) as b,
    count(*)::int                      as votes
  from similar_votes
  group by 1, 2;

-- Per-pair vote counts in the direction used by the work page (from -> to, merged).
create or replace view similar_vote_counts_directed as
  select from_work_id, to_work_id, votes
  from (
    select a as from_work_id, b as to_work_id, votes from similar_vote_counts
    union all
    select b as from_work_id, a as to_work_id, votes from similar_vote_counts
  ) s;

-- Pending (user-registered, not yet built) works, exposed read-only for /works/pending.
create or replace view works_pending_public
  with (security_invoker = false) as
  select id, slug, title, authors, cover_url, publisher, synopsis, affiliate_url_rakuten
  from works
  where status = 'pending' and is_adult = false;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function refresh_work_review_count() returns trigger
language plpgsql as $$
declare
  target uuid;
begin
  target := coalesce(new.work_id, old.work_id);
  update works
     set review_count = (select count(*) from reviews where work_id = target and status = 'visible'),
         updated_at   = now()
   where id = target;
  return null;
end $$;

drop trigger if exists reviews_refresh_count on reviews;
create trigger reviews_refresh_count
  after insert or update of status or delete on reviews
  for each row execute function refresh_work_review_count();

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists works_touch_updated_at on works;
create trigger works_touch_updated_at
  before update on works
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: anon is read-only, and only sees public rows.
-- All writes go through Edge Functions using the service role.
-- ---------------------------------------------------------------------------
alter table works            enable row level security;
alter table work_volumes     enable row level security;
alter table tags             enable row level security;
alter table work_tags        enable row level security;
alter table work_embeddings  enable row level security;
alter table work_similarity  enable row level security;
alter table reviews          enable row level security;
alter table similar_votes    enable row level security;
alter table reports          enable row level security;
alter table post_log         enable row level security;
alter table build_triggers   enable row level security;

drop policy if exists works_anon_select on works;
create policy works_anon_select on works
  for select to anon, authenticated
  using (status = 'published' and is_adult = false);

drop policy if exists tags_anon_select on tags;
create policy tags_anon_select on tags
  for select to anon, authenticated using (true);

drop policy if exists work_tags_anon_select on work_tags;
create policy work_tags_anon_select on work_tags
  for select to anon, authenticated using (true);

drop policy if exists work_similarity_anon_select on work_similarity;
create policy work_similarity_anon_select on work_similarity
  for select to anon, authenticated using (true);

-- reviews carry ip_hash, so anon never reads the table directly; use reviews_public.
revoke select on reviews from anon, authenticated;

create or replace view reviews_public
  with (security_invoker = false) as
  select id, work_id, nickname, body, rating, has_spoiler, created_at
  from reviews
  where status = 'visible';
grant select on reviews_public to anon, authenticated;

-- similar_votes rows themselves are private; counts are exposed via the views below.
grant select on similar_vote_counts to anon, authenticated;
grant select on similar_vote_counts_directed to anon, authenticated;
grant select on works_pending_public to anon, authenticated;

-- Views run as owner (security_invoker = false) so they can read the private tables.
alter view similar_vote_counts set (security_invoker = false);
alter view similar_vote_counts_directed set (security_invoker = false);
