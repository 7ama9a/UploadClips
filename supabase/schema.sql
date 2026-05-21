-- 7Upload — Supabase PostgreSQL schema
-- Run in Supabase Dashboard → SQL Editor → New query → Run

-- Clips table
create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text default '',
  storage_path text not null,
  original_name text,
  mime_type text,
  file_size bigint,
  views integer not null default 0,
  created_at timestamptz not null default now()
);

-- Likes table
create table if not exists public.likes (
  clip_id uuid not null references public.clips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);

-- Profiles (Discord username + avatar from auth metadata)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  joined_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'preferred_username',
      split_part(coalesce(new.email, ''), '@', 1),
      'user'
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- View counter
create or replace function public.increment_clip_views(clip_uuid uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.clips set views = views + 1 where id = clip_uuid;
end;
$$;

-- Indexes
create index if not exists clips_user_id_idx on public.clips (user_id);
create index if not exists clips_created_at_idx on public.clips (created_at desc);
create index if not exists likes_clip_id_idx on public.likes (clip_id);

-- Row Level Security
alter table public.clips enable row level security;
alter table public.likes enable row level security;
alter table public.profiles enable row level security;

-- Profiles: everyone read, owner insert/update
create policy "profiles_read" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

grant execute on function public.increment_clip_views(uuid) to anon, authenticated;

-- Clips: everyone read, authenticated insert own, owner delete
create policy "clips_read" on public.clips for select using (true);
create policy "clips_insert" on public.clips for insert with check (auth.uid() = user_id);
create policy "clips_delete_own" on public.clips for delete using (auth.uid() = user_id);

-- Likes: everyone read, authenticated toggle own
create policy "likes_read" on public.likes for select using (true);
create policy "likes_insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes_delete_own" on public.likes for delete using (auth.uid() = user_id);

-- Storage bucket: create "clips" in Dashboard → Storage → New bucket
-- Public: ON (so friends can watch without login) OR use signed URLs in app
