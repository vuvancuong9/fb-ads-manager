-- Migration: patch uploaded_files và các bảng liên quan
-- Chạy migration này nếu các cột bị thiếu so với code hiện tại

-- Them cot file_size neu chua co
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;

-- Them cot error_message cho debug
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Doi ten raw_path -> error_message (neu ton tai raw_path nhung chua co error_message)
-- (skip neu da co ca hai)

-- Them total_rows alias (neu schema dung row_count)
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS total_rows INTEGER DEFAULT 0;

-- Sync total_rows = row_count neu can
UPDATE public.uploaded_files SET total_rows = row_count WHERE total_rows = 0 AND row_count > 0;

-- Them cot file_type check constraint mo rong
ALTER TABLE public.uploaded_files
  DROP CONSTRAINT IF EXISTS uploaded_files_file_type_check;
ALTER TABLE public.uploaded_files
  ADD CONSTRAINT uploaded_files_file_type_check
  CHECK (file_type IN ('ads', 'orders', 'affiliate', 'other'));

-- raw_ads_rows: dam bao parse_errors la TEXT (khong phai array)
-- (Trong schema goc la TEXT, code moi luu string join '|')

-- ads_daily_stats: dam bao unique index ton tai
CREATE UNIQUE INDEX IF NOT EXISTS ads_daily_stats_unique_idx
  ON public.ads_daily_stats (report_date, ad_id, sub_id_raw);

-- subid_daily_summary: dam bao unique index
CREATE UNIQUE INDEX IF NOT EXISTS subid_daily_summary_unique_idx
  ON public.subid_daily_summary (report_date, sub_id_normalized);

-- orders: unique index theo order_id
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_id_unique_idx
  ON public.orders (order_id);

-- Enable RLS (neu chua co)
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_ads_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_order_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subid_daily_summary ENABLE ROW LEVEL SECURITY;

-- Policy: service_role co quyen lam tat ca (supabaseAdmin dung service_role)
DO $$
BEGIN
  -- uploaded_files
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='uploaded_files' AND policyname='service_role_all') THEN
    EXECUTE 'CREATE POLICY service_role_all ON public.uploaded_files FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  -- raw_ads_rows
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='raw_ads_rows' AND policyname='service_role_all') THEN
    EXECUTE 'CREATE POLICY service_role_all ON public.raw_ads_rows FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  -- raw_order_rows
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='raw_order_rows' AND policyname='service_role_all') THEN
    EXECUTE 'CREATE POLICY service_role_all ON public.raw_order_rows FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  -- ads_daily_stats
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ads_daily_stats' AND policyname='service_role_all') THEN
    EXECUTE 'CREATE POLICY service_role_all ON public.ads_daily_stats FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  -- orders
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='service_role_all') THEN
    EXECUTE 'CREATE POLICY service_role_all ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  -- subid_daily_summary
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subid_daily_summary' AND policyname='service_role_all') THEN
    EXECUTE 'CREATE POLICY service_role_all ON public.subid_daily_summary FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
