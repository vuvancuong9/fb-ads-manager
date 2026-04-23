import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
    try {
          const { searchParams } = new URL(req.url)
          const tkAff = searchParams.get('tkAff')
          const onlyActive = searchParams.get('onlyActive') === 'true'
          const page = parseInt(searchParams.get('page') ?? '1')
          const limit = parseInt(searchParams.get('limit') ?? '50')
          const from = (page - 1) * limit
          const to = from + limit - 1

      const { data: latestRow } = await supabaseAdmin
            .from('ads_daily_stats').select('report_date')
            .order('report_date', { ascending: false }).limit(1).single()

      if (!latestRow) return NextResponse.json({ data: [], total: 0, page, limit })

      let query = supabaseAdmin.from('subid_summary').select('*', { count: 'exact' })
            .order('ads_ngay', { ascending: false }).range(from, to)

      if (tkAff) query = query.eq('tk_aff', tkAff)
          if (onlyActive) query = query.eq('has_ads_latest_day', true)

      const { data, count } = await query
          return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit, latestDate: latestRow.report_date })
    } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
