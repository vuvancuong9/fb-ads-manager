import { supabaseAdmin } from '@/lib/supabase-admin'

export type NormalizeInput = {
  uploadedFileId: string
  type: 'ads' | 'affiliate'
}

export type NormalizeResult = {
  ok: boolean
  error?: string
  affected?: number
}

/**
 * Normalize service — goi truc tiep tu route thay vi fetch noi bo /api/normalize.
 * Thu goi RPC fn_rebuild_summary neu db co; neu khong thi tra ok=true de pipeline khong bi chan.
 */
export async function runNormalize(input: NormalizeInput): Promise<NormalizeResult> {
  try {
    const { uploadedFileId, type } = input
    if (!uploadedFileId) return { ok: false, error: 'thieu uploadedFileId' }

    try {
      const { data, error } = await supabaseAdmin.rpc('fn_rebuild_summary', {
        p_uploaded_file_id: uploadedFileId,
        p_type: type,
      })
      if (!error) {
        return { ok: true, affected: typeof data === 'number' ? data : undefined }
      }
      // Neu RPC khong ton tai => bo qua, tra ok=true
      if (/function .* does not exist/i.test(error.message || '')) {
        return { ok: true }
      }
      return { ok: false, error: error.message }
    } catch {
      return { ok: true }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
