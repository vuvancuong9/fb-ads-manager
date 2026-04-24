-- ============================================================
-- Migration: 20260424_fix_indexes_rls_performance
-- Purpose: Add missing indexes, fix RLS policies, fix first-user race condition
-- ============================================================

-- ------------------------------------------------------------
-- FIX 1: Missing index on raw_ads_rows(uploaded_file_id)
-- Critical for normalize query performance
-- ------------------------------------------------------------
create index if not exists idx_raw_ads_rows_uploaded_file_id
  on public.raw_ads_rows (uploaded_file_id);

-- ------------------------------------------------------------
-- FIX 2: Missing index on ads_daily_stats(uploaded_file_id)
-- Needed for scoped rebuildSubIdSummary
-- ------------------------------------------------------------
create index if not exists idx_ads_daily_stats_uploaded_file_id
  on public.ads_daily_stats (uploaded_file_id);

-- ------------------------------------------------------------
-- FIX 3: Missing composite index on ads_daily_stats for dedup
-- ------------------------------------------------------------
create index if not exists idx_ads_daily_stats_dedup
  on public.ads_daily_stats (report_date, sub_id_normalized, ad_id);

-- ------------------------------------------------------------
-- FIX 4: Missing index on subid_daily_summary(sub_id_normalized)
-- Needed for scoped delete in rebuildSubIdSummary
-- ------------------------------------------------------------
create index if not exists idx_subid_daily_summary_sub_id_normalized
  on public.subid_daily_summary (sub_id_normalized);

-- ------------------------------------------------------------
-- FIX 5: Missing index on uploaded_files(file_hash, user_id)
-- Needed for race condition check and dedup
-- ------------------------------------------------------------
create index if not exists idx_uploaded_files_hash_user
  on public.uploaded_files (file_hash, user_id);

-- Missing index on uploaded_files(report_date, user_id, type)
create index if not exists idx_uploaded_files_report_date_user_type
  on public.uploaded_files (report_date, user_id, type);

-- Missing index on uploaded_files(status, user_id)
create index if not exists idx_uploaded_files_status_user
  on public.uploaded_files (status, user_id);

-- ------------------------------------------------------------
-- FIX 6: Fix RLS on profiles — missing INSERT policy causes
-- first-user-is-admin race condition and registration failures
-- ------------------------------------------------------------
-- Drop existing insert policy if any (idempotent)
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- ------------------------------------------------------------
-- FIX 7: Add user_id column to uploaded_files if missing
-- (uploaded_file should always be scoped to a user)
-- ------------------------------------------------------------
alter table public.uploaded_files
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Index for user_id lookups
create index if not exists idx_uploaded_files_user_id
  on public.uploaded_files (user_id);

-- RLS: Ensure users can only see their own uploaded files
drop policy if exists "Users can view own uploads" on public.uploaded_files;
create policy "Users can view own uploads"
  on public.uploaded_files
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own uploads" on public.uploaded_files;
create policy "Users can insert own uploads"
  on public.uploaded_files
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own uploads" on public.uploaded_files;
create policy "Users can update own uploads"
  on public.uploaded_files
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own uploads" on public.uploaded_files;
create policy "Users can delete own uploads"
  on public.uploaded_files
  for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- FIX 8: Fix traffic_manager_data.date column type
-- Currently TEXT, should be DATE for proper filtering/sorting
-- ------------------------------------------------------------
-- Only alter if column is text type (safe migration)
do $$
begin
  if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'traffic_manager_data'
        and column_name = 'date'
        and data_type = 'text'
    ) then
    alter table public.traffic_manager_data
      alter column date type date using date::date;
  end if;
end;
$$;

-- Add index on traffic_manager_data.date
create index if not exists idx_traffic_manager_data_date
  on public.traffic_manager_data (date);

-- ============================================================
-- End of migration
-- ============================================================
