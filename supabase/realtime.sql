-- Enable Realtime for live clips / likes / users (run in SQL Editor)
alter publication supabase_realtime add table public.clips;
alter publication supabase_realtime add table public.likes;
alter publication supabase_realtime add table public.profiles;
