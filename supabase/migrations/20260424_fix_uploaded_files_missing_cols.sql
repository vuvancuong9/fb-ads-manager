-- Migration: Add missing columns to uploaded_files
-- Run this in Supabase SQL Editor

-- Them file_size (bytes) vao uploaded_files
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;

-- Them error_message de luu loi neu co
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Them uploaded_by neu chua co (co the da co trong schema cu)
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS uploaded_by TEXT;

-- Xac nhan: raw_ads_rows da co subid_normalized va tk_aff (tu migration truoc)
-- Neu chua co (chay lan dau) thi chay:
ALTER TABLE public.raw_ads_rows
  ADD COLUMN IF NOT EXISTS subid_normalized TEXT;

ALTER TABLE public.raw_ads_rows
  ADD COLUMN IF NOT EXISTS tk_aff TEXT;
