-- Run this in Supabase SQL Editor after deploying the new /api/lifeos/state route.
-- It keeps LifeOS shared data behind the Vercel API instead of direct browser table access.

alter table public.fasting_sessions enable row level security;
alter table public.workout_logs enable row level security;
alter table public.meal_timelines enable row level security;
alter table public.recipes enable row level security;
alter table public.lift_progress enable row level security;

revoke all on table public.fasting_sessions from anon, authenticated;
revoke all on table public.workout_logs from anon, authenticated;
revoke all on table public.meal_timelines from anon, authenticated;
revoke all on table public.recipes from anon, authenticated;
revoke all on table public.lift_progress from anon, authenticated;

drop policy if exists "lifeos_browser_read_fasting_sessions" on public.fasting_sessions;
drop policy if exists "lifeos_browser_read_workout_logs" on public.workout_logs;
drop policy if exists "lifeos_browser_read_meal_timelines" on public.meal_timelines;
drop policy if exists "lifeos_browser_read_recipes" on public.recipes;
drop policy if exists "lifeos_browser_read_lift_progress" on public.lift_progress;
