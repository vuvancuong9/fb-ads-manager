-- Bulk jobs and items
CREATE TABLE IF NOT EXISTS public.bulk_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  action TEXT NOT NULL,
  action_label TEXT,
  percent NUMERIC,
  sub_ids JSONB,
  total_items INTEGER DEFAULT 0,
  status TEXT DEFAULT 'queued',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.bulk_job_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bulk_job_id TEXT REFERENCES public.bulk_jobs(id) ON DELETE CASCADE,
  item_index INTEGER,
  target_kind TEXT,
  target_id TEXT,
  sub_id TEXT,
  campaign_id TEXT,
  adset_id TEXT,
  action TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT DEFAULT 'queued',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bulk_items_job ON public.bulk_job_items(bulk_job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_items_status ON public.bulk_job_items(status);

ALTER TABLE public.bulk_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_job_items ENABLE ROW LEVEL SECURITY;
