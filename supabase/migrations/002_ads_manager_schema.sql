-- =============================================
-- FB ADS MANAGER - SCHEMA MIGRATION
-- =============================================

-- Uploaded files tracking
CREATE TABLE IF NOT EXISTS public.uploaded_files (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  file_type TEXT NOT NULL CHECK (file_type IN ('ads', 'orders')),
  report_date TIMESTAMPTZ NOT NULL,
  row_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  raw_path TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw ads rows
CREATE TABLE IF NOT EXISTS public.raw_ads_rows (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  uploaded_file_id TEXT REFERENCES public.uploaded_files(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  report_date TIMESTAMPTZ NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  sub_id TEXT,
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  raw_data JSONB,
  parse_errors TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw order rows
CREATE TABLE IF NOT EXISTS public.raw_order_rows (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  uploaded_file_id TEXT REFERENCES public.uploaded_files(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  report_date TIMESTAMPTZ NOT NULL,
  order_id TEXT,
  sub_id TEXT,
  tk_aff TEXT,
  commission NUMERIC DEFAULT 0,
  order_amount NUMERIC DEFAULT 0,
  status TEXT,
  raw_data JSONB,
  parse_errors TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ads daily stats (normalized)
CREATE TABLE IF NOT EXISTS public.ads_daily_stats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_date TIMESTAMPTZ NOT NULL,
  sub_id_raw TEXT NOT NULL DEFAULT '',
  sub_id_normalized TEXT NOT NULL DEFAULT '',
  tk_aff TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (report_date, ad_id, sub_id_raw)
);

-- Orders normalized
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_date TIMESTAMPTZ NOT NULL,
  order_id TEXT,
  sub_id_raw TEXT NOT NULL DEFAULT '',
  sub_id_normalized TEXT NOT NULL DEFAULT '',
  tk_aff TEXT,
  commission NUMERIC DEFAULT 0,
  order_amount NUMERIC DEFAULT 0,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SubID daily summary
CREATE TABLE IF NOT EXISTS public.subid_daily_summary (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_date TIMESTAMPTZ NOT NULL,
  sub_id_normalized TEXT NOT NULL,
  tk_aff TEXT,
  ads_spend NUMERIC DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  total_commission NUMERIC DEFAULT 0,
  roi_daily NUMERIC DEFAULT 0,
  total_ads_all_time NUMERIC DEFAULT 0,
  total_orders_all_time INTEGER DEFAULT 0,
  total_commission_all_time NUMERIC DEFAULT 0,
  roi_total NUMERIC DEFAULT 0,
  has_ads_latest_day BOOLEAN DEFAULT false,
  action_suggestion TEXT DEFAULT 'NO_ACTION',
  action_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (report_date, sub_id_normalized)
);

-- Affiliate accounts (TK AFF codes)
CREATE TABLE IF NOT EXISTS public.affiliate_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rules
CREATE TABLE IF NOT EXISTS public.rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  conditions JSONB NOT NULL DEFAULT '[]',
  condition_logic TEXT DEFAULT 'AND',
  suggestion TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action logs
CREATE TABLE IF NOT EXISTS public.action_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  target_id TEXT,
  payload JSONB,
  result TEXT,
  raw_response JSONB,
  error TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ads_stats_date ON public.ads_daily_stats(report_date);
CREATE INDEX IF NOT EXISTS idx_ads_stats_subid ON public.ads_daily_stats(sub_id_normalized);
CREATE INDEX IF NOT EXISTS idx_ads_stats_tkAff ON public.ads_daily_stats(tk_aff);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders(report_date);
CREATE INDEX IF NOT EXISTS idx_orders_subid ON public.orders(sub_id_normalized);
CREATE INDEX IF NOT EXISTS idx_summary_date ON public.subid_daily_summary(report_date);
CREATE INDEX IF NOT EXISTS idx_summary_subid ON public.subid_daily_summary(sub_id_normalized);
CREATE INDEX IF NOT EXISTS idx_summary_active ON public.subid_daily_summary(has_ads_latest_day);
CREATE INDEX IF NOT EXISTS idx_logs_created ON public.action_logs(created_at);

-- Enable RLS
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_ads_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_order_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subid_daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

-- Seed default affiliate accounts
INSERT INTO public.affiliate_accounts (code, name) VALUES
  ('VKC', 'VKC Account'),
  ('ANN', 'ANN Account'),
  ('HANG', 'HANG Account'),
  ('DNX', 'DNX Account'),
  ('MA', 'MA Account')
ON CONFLICT (code) DO NOTHING;

-- Seed default rules
INSERT INTO public.rules (name, is_active, priority, conditions, condition_logic, suggestion, reason) VALUES
  ('Chi phi qua nho', true, 100, '[{"field":"adsDaily","operator":"lt","value":50000}]', 'AND', 'NO_ACTION', 'Chi phi ngay qua nho, khong hanh dong'),
  ('ROI rat thap - Tat ads', true, 90, '[{"field":"roiDaily","operator":"lt","value":0.3},{"field":"adsDaily","operator":"gte","value":100000}]', 'AND', 'PAUSE', 'ROI ngay = {roiDaily}, Chi phi = {adsDaily} - Lo nang, nen tat'),
  ('ROI thap - Giam budget', true, 80, '[{"field":"roiDaily","operator":"gte","value":0.3},{"field":"roiDaily","operator":"lt","value":0.8}]', 'AND', 'DECREASE_20', 'ROI ngay = {roiDaily} - Thap, giam budget 20%'),
  ('ROI on - Giu nguyen', true, 70, '[{"field":"roiDaily","operator":"gte","value":0.8},{"field":"roiDaily","operator":"lt","value":1.3}]', 'AND', 'KEEP', 'ROI ngay = {roiDaily} - On dinh, giu nguyen'),
  ('ROI cao - Tang budget', true, 60, '[{"field":"roiDaily","operator":"gte","value":1.3},{"field":"ordersDaily","operator":"gte","value":2}]', 'AND', 'INCREASE_20', 'ROI ngay = {roiDaily}, Don ngay = {ordersDaily} - Loi tot, tang budget 20%')
ON CONFLICT DO NOTHING;
