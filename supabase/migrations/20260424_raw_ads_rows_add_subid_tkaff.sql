-- Migration: them subid_normalized va tk_aff vao raw_ads_rows
-- Chay migration nay neu chua co 2 cot nay

ALTER TABLE public.raw_ads_rows
  ADD COLUMN IF NOT EXISTS subid_normalized TEXT;

ALTER TABLE public.raw_ads_rows
  ADD COLUMN IF NOT EXISTS tk_aff TEXT;

-- Index de query nhanh hon
CREATE INDEX IF NOT EXISTS raw_ads_rows_subid_normalized_idx
  ON public.raw_ads_rows (subid_normalized);

CREATE INDEX IF NOT EXISTS raw_ads_rows_report_date_idx
  ON public.raw_ads_rows (report_date);
