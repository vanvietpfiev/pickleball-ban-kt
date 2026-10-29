-- =========================================================
--  PICKLEBALL BAN KT – SCHEMA SUPABASE
--  Cách dùng: Supabase Dashboard → SQL Editor → New query →
--  dán toàn bộ file này → Run. Chạy lại nhiều lần vẫn an toàn.
-- =========================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------
-- 1. BẢNG
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key default gen_random_uuid(),
  auth_id           uuid unique references auth.users(id) on delete set null, -- null = hồ sơ tạo hộ chưa kích hoạt
  email             text,
  full_name         text not null,
  handle            text not null unique,
  gender            text not null default 'M' check (gender in ('M','F')),
  dept              text default '',
  title             text default '',
  bio               text default '',
  avatar_url        text default '',
  google_avatar_url text default '',
  status            text not null default 'pending' check (status in ('pending','approved','locked')),
  role              text not null default 'member' check (role in ('member','admin')),
  leader            boolean not null default false,
  managed           boolean not null default false,
  claimed           boolean not null default false,
  claimed_at        timestamptz,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create unique index if not exists profiles_email_uq on public.profiles (lower(email)) where email is not null and email <> '';

create table if not exists public.tournaments (
  id          text primary key,
  data        jsonb not null,                -- toàn bộ giải: series, đội, trận, đăng ký…
  created_by  uuid not null references public.profiles(id),
  managers    uuid[] not null default '{}',
  version     int not null default 1,        -- khoá lạc quan khi nhiều người nhập điểm cùng lúc
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.topics (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null default '',
  category      text not null default 'chung',
  tournament_id text references public.tournaments(id) on delete set null,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  pinned        boolean not null default false,
  reactions     jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  deleted_at    timestamptz
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics(id) on delete cascade,
  parent_id   uuid references public.comments(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  reactions   jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  recalled_by uuid references public.profiles(id) on delete set null
);
create index if not exists comments_topic_idx on public.comments(topic_id);

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  actor_id      uuid references public.profiles(id) on delete set null,
  topic_id      uuid references public.topics(id) on delete cascade,
  comment_id    uuid references public.comments(id) on delete cascade,
  tournament_id text references public.tournaments(id) on delete cascade,
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------------------------------------------------------
-- 2. HÀM TIỆN ÍCH (security definer để tránh vòng lặp RLS)
-- ---------------------------------------------------------
create or replace function public.my_pid() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_id = auth.uid() limit 1
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where auth_id = auth.uid() and status = 'approved')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where auth_id = auth.uid() and status = 'approved' and role = 'admin')
$$;

create or replace function public.can_manage(t public.tournaments) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_approved() and (t.created_by = public.my_pid() or public.my_pid() = any(t.managers)))
$$;

create or replace function public.unique_handle(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare base text; h text; i int := 1;
begin
  base := left(lower(regexp_replace(extensions.unaccent(coalesce(p_name, '')), '[^a-zA-Z0-9]', '', 'g')), 20);
  if base = '' then base := 'user'; end if;
  h := base;
  while exists (select 1 from public.profiles where handle = h) loop
    i := i + 1; h := base || i;
  end loop;
  return h;
end $$;

-- ---------------------------------------------------------
-- 3. TÀI KHOẢN MỚI → tạo hồ sơ (hoặc nhận hồ sơ lãnh đạo tạo hộ)
-- ---------------------------------------------------------
create or replace function public.ensure_profile(u auth.users) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email  text := lower(u.email);
  v_name   text := coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1));
  v_avatar text := coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '');
  v_pre    public.profiles;
  v_first  boolean;
begin
  if exists (select 1 from public.profiles where auth_id = u.id) then return; end if;
  perform set_config('app.bypass', 'on', true);

  select * into v_pre from public.profiles
   where managed and not claimed and auth_id is null and lower(email) = v_email limit 1;
  if found then
    -- chỉ nhận hồ sơ tạo hộ khi email đã xác minh, tránh người khác đăng ký giả email lãnh đạo
    if u.email_confirmed_at is null then return; end if;
    update public.profiles set
      auth_id = u.id, claimed = true, claimed_at = now(),
      google_avatar_url = v_avatar,
      avatar_url = case when coalesce(avatar_url, '') = '' then v_avatar else avatar_url end
    where id = v_pre.id;
    if v_pre.created_by is not null then
      insert into public.notifications(user_id, type, actor_id) values (v_pre.created_by, 'claimed', v_pre.id);
    end if;
    return;
  end if;

  v_first := not exists (select 1 from public.profiles where role = 'admin');
  insert into public.profiles(id, auth_id, email, full_name, handle, avatar_url, google_avatar_url, status, role)
  values (u.id, u.id, v_email, v_name, public.unique_handle(v_name), v_avatar, v_avatar,
          case when v_first then 'approved' else 'pending' end,
          case when v_first then 'admin' else 'member' end)
  on conflict (id) do nothing;

  if not v_first then
    insert into public.notifications(user_id, type, actor_id)
    select id, 'pending', u.id from public.profiles where role = 'admin' and status = 'approved';
  end if;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_profile(new);
  return new;
end $$;

-- Khi người dùng bấm link xác nhận email → lúc này mới nhận hồ sơ lãnh đạo (nếu có)
create or replace function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.ensure_profile(new);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- Không cho gọi trực tiếp từ client
revoke execute on function public.ensure_profile(auth.users) from public, anon, authenticated;
revoke execute on function public.unique_handle(text) from public, anon, authenticated;

-- Chặn người thường tự đổi vai trò / trạng thái / chức vụ…
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.bypass', true), '') = 'on' then return new; end if;
  if not public.is_admin() then
    new.role := old.role; new.status := old.status; new.title := old.title; new.leader := old.leader;
    new.email := old.email;
  elsif not (old.managed and not old.claimed) then
    new.email := old.email; -- email chỉ sửa được trên hồ sơ tạo hộ chưa kích hoạt
  end if;
  new.managed := old.managed; new.claimed := old.claimed; new.claimed_at := old.claimed_at;
  new.auth_id := old.auth_id; new.created_by := old.created_by; new.google_avatar_url := old.google_avatar_url;
  new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- Thông báo "đã được duyệt"
create or replace function public.notify_approved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' and new.auth_id is not null then
    insert into public.notifications(user_id, type, actor_id) values (new.id, 'approved', public.my_pid());
  end if;
  return new;
end $$;
drop trigger if exists profiles_notify_approved on public.profiles;
create trigger profiles_notify_approved after update on public.profiles
  for each row execute function public.notify_approved();

-- Không cho người không phải admin đổi người tạo giải
create or replace function public.protect_tournament() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by <> old.created_by and not public.is_admin() then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists tournaments_protect on public.tournaments;
create trigger tournaments_protect before update on public.tournaments
  for each row execute function public.protect_tournament();

-- Chỉ admin được ghim chủ đề
create or replace function public.protect_topic() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pinned <> old.pinned and not public.is_admin() then new.pinned := old.pinned; end if;
  if (new.title <> old.title or new.body <> old.body) and old.author_id <> public.my_pid() then
    raise exception 'Chỉ tác giả được sửa chủ đề.';
  end if;
  return new;
end $$;
drop trigger if exists topics_protect on public.topics;
create trigger topics_protect before update on public.topics
  for each row execute function public.protect_topic();

create or replace function public.protect_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.body <> old.body and old.author_id <> public.my_pid() then
    raise exception 'Chỉ người viết được sửa bình luận.';
  end if;
  return new;
end $$;
drop trigger if exists comments_protect on public.comments;
create trigger comments_protect before update on public.comments
  for each row execute function public.protect_comment();

-- ---------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.tournaments   enable row level security;
alter table public.topics        enable row level security;
alter table public.comments      enable row level security;
alter table public.notifications enable row level security;

-- profiles
drop policy if exists p_sel on public.profiles;
drop policy if exists p_upd on public.profiles;
drop policy if exists p_ins on public.profiles;
drop policy if exists p_del on public.profiles;
create policy p_sel on public.profiles for select to authenticated using (true);
create policy p_upd on public.profiles for update to authenticated
  using (auth_id = auth.uid() or public.is_admin()) with check (true);
create policy p_ins on public.profiles for insert to authenticated
  with check (public.is_admin() and managed and auth_id is null);
create policy p_del on public.profiles for delete to authenticated
  using (public.is_admin() and managed and not claimed);

-- tournaments
drop policy if exists t_sel on public.tournaments;
drop policy if exists t_ins on public.tournaments;
drop policy if exists t_upd on public.tournaments;
drop policy if exists t_del on public.tournaments;
create policy t_sel on public.tournaments for select to authenticated using (true);
create policy t_ins on public.tournaments for insert to authenticated
  with check (public.is_approved() and created_by = public.my_pid());
create policy t_upd on public.tournaments for update to authenticated
  using (public.is_admin() or (public.is_approved() and (created_by = public.my_pid() or public.my_pid() = any(managers))))
  with check (public.is_approved());
create policy t_del on public.tournaments for delete to authenticated
  using (public.is_admin() or (public.is_approved() and created_by = public.my_pid()));

-- topics
drop policy if exists tp_sel on public.topics;
drop policy if exists tp_ins on public.topics;
drop policy if exists tp_upd on public.topics;
create policy tp_sel on public.topics for select to authenticated using (true);
create policy tp_ins on public.topics for insert to authenticated
  with check (public.is_approved() and author_id = public.my_pid());
create policy tp_upd on public.topics for update to authenticated
  using (public.is_approved() and (author_id = public.my_pid() or public.is_admin())) with check (true);

-- comments
drop policy if exists c_sel on public.comments;
drop policy if exists c_ins on public.comments;
drop policy if exists c_upd on public.comments;
create policy c_sel on public.comments for select to authenticated using (true);
create policy c_ins on public.comments for insert to authenticated
  with check (public.is_approved() and author_id = public.my_pid());
create policy c_upd on public.comments for update to authenticated
  using (public.is_approved() and (author_id = public.my_pid() or public.is_admin())) with check (true);

-- notifications
drop policy if exists n_sel on public.notifications;
drop policy if exists n_ins on public.notifications;
drop policy if exists n_upd on public.notifications;
create policy n_sel on public.notifications for select to authenticated using (user_id = public.my_pid());
create policy n_ins on public.notifications for insert to authenticated
  with check (public.is_approved() and actor_id = public.my_pid());
create policy n_upd on public.notifications for update to authenticated
  using (user_id = public.my_pid()) with check (user_id = public.my_pid());

-- ---------------------------------------------------------
-- 5. RPC: đăng ký giải, huỷ đăng ký, thả cảm xúc
-- ---------------------------------------------------------
create or replace function public.register_tournament(p_tid text, p_series text, p_partner jsonb default null, p_team_name text default '', p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournaments; me uuid := public.my_pid(); r jsonb;
begin
  if not public.is_approved() then raise exception 'Tài khoản đang chờ admin duyệt – tạm thời chỉ được xem.'; end if;
  select * into t from public.tournaments where id = p_tid for update;
  if not found or coalesce((t.data->>'regOpen')::boolean, false) = false then raise exception 'Giải này không mở đăng ký.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(t.data->'registrations', '[]')) x
             where x->>'pid' = me::text and x->>'series_id' = p_series and x->>'status' not in ('rejected','cancelled')) then
    raise exception 'Bạn đã đăng ký nội dung này rồi.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(t.data->'series', '[]')) s,
                         jsonb_array_elements(coalesce(s->'teams', '[]')) tm,
                         jsonb_array_elements(coalesce(tm->'players', '[]')) pl
             where s->>'id' = p_series and pl->>'pid' = me::text) then
    raise exception 'Bạn đã có tên trong nội dung này.';
  end if;
  r := jsonb_build_object('id', 'rg_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10),
       'pid', me, 'series_id', p_series, 'partner', p_partner, 'team_name', coalesce(p_team_name, ''),
       'note', coalesce(p_note, ''), 'status', 'pending', 'created_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.tournaments
     set data = jsonb_set(data, '{registrations}', coalesce(data->'registrations', '[]') || r), version = version + 1
   where id = p_tid;
  insert into public.notifications(user_id, type, actor_id, tournament_id)
  select distinct u, 'registration', me, p_tid from unnest(array_append(t.managers, t.created_by)) u where u <> me;
  return r;
end $$;

create or replace function public.cancel_registration(p_tid text, p_rid text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tournaments; me uuid := public.my_pid(); r jsonb;
begin
  select * into t from public.tournaments where id = p_tid for update;
  select x into r from jsonb_array_elements(coalesce(t.data->'registrations', '[]')) x where x->>'id' = p_rid;
  if r is null or not (r->>'pid' = me::text or public.can_manage(t)) then raise exception 'Không có quyền huỷ đăng ký này.'; end if;
  update public.tournaments set version = version + 1, data = jsonb_set(data, '{registrations}',
    (select jsonb_agg(case when x->>'id' = p_rid then jsonb_set(x, '{status}', '"cancelled"') else x end)
       from jsonb_array_elements(data->'registrations') x))
   where id = p_tid;
end $$;

create or replace function public.toggle_reaction(p_kind text, p_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare me text := public.my_pid()::text; cur jsonb; arr jsonb;
begin
  if not public.is_approved() then raise exception 'Tài khoản đang chờ admin duyệt – tạm thời chỉ được xem.'; end if;
  if p_kind = 'topic' then select reactions into cur from public.topics where id = p_id for update;
  else select reactions into cur from public.comments where id = p_id for update; end if;
  cur := coalesce(cur, '{}');
  arr := coalesce(cur->p_emoji, '[]');
  if arr ? me then
    select coalesce(jsonb_agg(v), '[]') into arr from jsonb_array_elements_text(arr) v where v <> me;
  else
    arr := arr || to_jsonb(me);
  end if;
  if jsonb_array_length(arr) = 0 then cur := cur - p_emoji; else cur := jsonb_set(cur, array[p_emoji], arr); end if;
  if p_kind = 'topic' then update public.topics set reactions = cur where id = p_id;
  else update public.comments set reactions = cur where id = p_id; end if;
end $$;

-- ---------------------------------------------------------
-- 6. ẢNH ĐẠI DIỆN (Storage bucket công khai "avatars")
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = true;

drop policy if exists av_read on storage.objects;
drop policy if exists av_ins on storage.objects;
drop policy if exists av_upd on storage.objects;
drop policy if exists av_del on storage.objects;
create policy av_read on storage.objects for select using (bucket_id = 'avatars');
create policy av_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = public.my_pid()::text or public.is_admin()));
create policy av_upd on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = public.my_pid()::text or public.is_admin()));
create policy av_del on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = public.my_pid()::text or public.is_admin()));

-- ---------------------------------------------------------
-- 7. REALTIME
-- ---------------------------------------------------------
do $$
declare tb text;
begin
  foreach tb in array array['profiles','tournaments','topics','comments','notifications'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tb);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Xong! Người ĐẦU TIÊN đăng nhập sẽ tự động là admin.
