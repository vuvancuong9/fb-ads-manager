-- Migration: Fix nullable dates + ads_daily_stats unique constraint
-- Run this in Supabase SQL Editor

-- 1. Allow NULL report_date in uploaded_files (khi parse khong ra date)
ALTER TABLE public.uploaded_files
  ALTER COLUMN report_date DROP NOT NULL;

-- 2. Allow NULL report_date in raw_ads_rows (khi parse khong ra date)
ALTER TABLE public.raw_ads_rows
  ALTER COLUMN report_date DROP NOT NULL;

-- 3. Allow NULL report_date in raw_order_rows
ALTER TABLE public.raw_order_rows
  ALTER COLUMN report_date DROP NOT NULL;

-- 4. Drop constraint cu tren ads_daily_stats va tao lai voi ad_name de tranh conflict khi ad_id = NULL
ALTER TABLE public.ads_daily_stats
  DROP CONSTRAINT IF EXISTS ads_daily_stats_report_date_ad_id_sub_id_raw_key;

-- 5. Them unique constraint moi: (report_date, ad_id, ad_name, sub_id_raw)
--    Dung COALESCE de tranh NULL clash
ALTER TABLE public.ads_daily_stats
  ADD CONSTRAINT ads_daily_stats_unique_key
  UNIQUE NULLS NOT DISTINCT (report_date, ad_id, ad_name, sub_id_raw);

-- 6. Them index cho ads_daily_stats
CREATE INDEX IF NOT EXISTS idx_ads_daily_stats_date ON public.ads_daily_stats (report_date);
CREATE INDEX IF NOT EXISTS idx_ads_daily_stats_sub ON public.ads_daily_stats (sub_id_normalized);
