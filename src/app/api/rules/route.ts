import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { data } = await supabaseAdmin.from('rules').select('*').order('priority', { ascending: false })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabaseAdmin.from('rules').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PUT() {
  const defaultRules = [
    { name: 'Chi phi qua nho', is_active: true, priority: 100, conditions: [{"field":"adsDaily","operator":"lt","value":50000}], condition_logic: 'AND', suggestion: 'NO_ACTION', reason: 'Chi phi ngay qua nho ({adsDaily}), khong hanh dong' },
    { name: 'ROI rat thap - Tat ads', is_active: true, priority: 90, conditions: [{"field":"roiDaily","operator":"lt","value":0.3},{"field":"adsDaily","operator":"gte","value":100000}], condition_logic: 'AND', suggestion: 'PAUSE', reason: 'ROI ngay = {roiDaily}, Chi phi = {adsDaily} - Lo nang' },
    { name: 'ROI thap - Giam budget', is_active: true, priority: 80, conditions: [{"field":"roiDaily","operator":"gte","value":0.3},{"field":"roiDaily","operator":"lt","value":0.8}], condition_logic: 'AND', suggestion: 'DECREASE_20', reason: 'ROI ngay = {roiDaily} - Thap, giam 20%' },
    { name: 'ROI on - Giu nguyen', is_active: true, priority: 70, conditions: [{"field":"roiDaily","operator":"gte","value":0.8},{"field":"roiDaily","operator":"lt","value":1.3}], condition_logic: 'AND', suggestion: 'KEEP', reason: 'ROI ngay = {roiDaily} - On dinh' },
    { name: 'ROI cao - Tang budget', is_active: true, priority: 60, conditions: [{"field":"roiDaily","operator":"gte","value":1.3},{"field":"ordersDaily","operator":"gte","value":2}], condition_logic: 'AND', suggestion: 'INCREASE_20', reason: 'ROI ngay = {roiDaily}, Don = {ordersDaily} - Loi tot, tang 20%' },
  ]
  const { data } = await supabaseAdmin.from('rules').select('id').limit(1)
  if (!data || data.length === 0) {
    await supabaseAdmin.from('rules').insert(defaultRules)
  }
  const { data: rules } = await supabaseAdmin.from('rules').select('*').order('priority', { ascending: false })
  return NextResponse.json({ seeded: true, rules: rules ?? [] })
}
