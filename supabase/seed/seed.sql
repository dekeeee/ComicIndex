-- Development seed: a handful of works, tags and reviews so the site has something to render
-- before the Rakuten ingest runs. Safe to re-run (upserts by natural keys).
-- Apply with: psql "$DATABASE_URL" -f supabase/seed/seed.sql   (or `supabase db reset` picks it up via config.toml)

insert into tags (slug, name, category) values
  ('shonen', '少年', 'genre'),
  ('seinen', '青年', 'genre'),
  ('isekai', '異世界', 'theme'),
  ('battle', 'バトル', 'theme'),
  ('school', '学園', 'setting'),
  ('tearjerker', '泣ける', 'mood')
on conflict (slug) do nothing;

insert into works (slug, rakuten_series_key, title, authors, publisher, synopsis, cover_url, first_sales_date, volume_count, affiliate_url_rakuten, status)
values
  ('w-seed000001', 'seed|剣と魔法の放課後|朝日奈々', '剣と魔法の放課後', '{"朝日 奈々"}', 'サンプル出版',
   '普通の高校生が放課後だけ異世界に召喚される。帰るためには魔王を倒すしかない。', null, '2011-04-01', 3, 'https://books.rakuten.co.jp/', 'published'),
  ('w-seed000002', 'seed|夕焼けの向こう側|山田太郎', '夕焼けの向こう側', '{"山田 太郎"}', 'サンプル出版',
   '田舎町で暮らす姉弟の10年を描く、静かな家族の物語。', null, '2012-04-01', 4, 'https://books.rakuten.co.jp/', 'published'),
  ('w-seed000003', 'seed|鋼の転生録|佐藤花', '鋼の転生録', '{"佐藤 花"}', 'サンプル出版',
   'トラックにひかれた青年が鍛冶師として異世界に転生。武器で世界を変える。', null, '2013-04-01', 5, 'https://books.rakuten.co.jp/', 'published'),
  ('w-seed000004', 'seed|放送部の朝|鈴木一', '放送部の朝', '{"鈴木 一"}', 'サンプル出版',
   '廃部寸前の放送部を立て直す、笑って泣ける部活青春もの。', null, '2014-04-01', 6, 'https://books.rakuten.co.jp/', 'published')
on conflict (rakuten_series_key) do update
  set title = excluded.title, synopsis = excluded.synopsis, updated_at = now();

insert into work_tags (work_id, tag_id, weight)
select w.id, t.id, 1.0
from (values
  ('w-seed000001', 'shonen'), ('w-seed000001', 'isekai'), ('w-seed000001', 'school'), ('w-seed000001', 'battle'),
  ('w-seed000002', 'seinen'), ('w-seed000002', 'tearjerker'),
  ('w-seed000003', 'shonen'), ('w-seed000003', 'isekai'), ('w-seed000003', 'battle'),
  ('w-seed000004', 'shonen'), ('w-seed000004', 'school'), ('w-seed000004', 'tearjerker')
) as pairs(work_slug, tag_slug)
join works w on w.slug = pairs.work_slug
join tags t on t.slug = pairs.tag_slug
on conflict do nothing;

-- Hand-written similarity so the work page has cards before the batch runs.
insert into work_similarity (from_work_id, to_work_id, rank, score, score_embed, score_tag, score_vote)
select a.id, b.id, pairs.rank, pairs.score, pairs.score, 0, 0
from (values
  ('w-seed000001', 'w-seed000003', 1, 0.82),
  ('w-seed000001', 'w-seed000004', 2, 0.61),
  ('w-seed000003', 'w-seed000001', 1, 0.82),
  ('w-seed000004', 'w-seed000001', 1, 0.61),
  ('w-seed000004', 'w-seed000002', 2, 0.55),
  ('w-seed000002', 'w-seed000004', 1, 0.55)
) as pairs(from_slug, to_slug, rank, score)
join works a on a.slug = pairs.from_slug
join works b on b.slug = pairs.to_slug
on conflict (from_work_id, to_work_id) do update set rank = excluded.rank, score = excluded.score;

insert into reviews (work_id, nickname, body, rating, has_spoiler, status, ip_hash)
select w.id, r.nickname, r.body, r.rating, r.has_spoiler, 'visible', 'seed'
from (values
  ('w-seed000001', '名無し', '設定は王道だけどテンポが良くて一気読みしました。主人公の成長が丁寧。', 4, false),
  ('w-seed000001', '漫画好き', '最終巻の展開でまさか魔王が味方になるとは思わなかった。伏線回収が見事でした。', 5, true),
  ('w-seed000002', '名無し', '派手さはないけれど、読み終わったあとに静かに残る作品。夕焼けの描写が本当にきれい。', 5, false)
) as r(work_slug, nickname, body, rating, has_spoiler)
join works w on w.slug = r.work_slug
where not exists (select 1 from reviews x where x.work_id = w.id and x.ip_hash = 'seed' and x.body = r.body);
