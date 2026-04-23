import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseAdsFile } from '@/lib/parser/ads-parser'
import { createHash } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Khong co file' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileHash = createHash('sha256').update(buffer).digest('hex')

    // Kiem tra trung file
    const existing = await prisma.uploadedFile.findUnique({ where: { fileHash } })
    if (existing) {
      return NextResponse.json({ error: 'File nay da duoc upload truoc do', uploadedFileId: existing.id }, { status: 409 })
    }

    const result = await parseAdsFile(buffer, file.name)

    // Tao uploaded file record
    const reportDate = result.rows[0]?.reportDate ?? result.errorRows[0]?.reportDate ?? new Date()
    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        fileName: file.name,
        fileHash,
        fileType: 'ads',
        reportDate,
        rowCount: result.totalRows,
        errorCount: result.errorCount,
        status: 'processing',
      },
    })

    // Luu raw rows
    if (result.rows.length > 0) {
      await prisma.rawAdsRow.createMany({
        data: result.rows.map(row => ({
          uploadedFileId: uploadedFile.id,
          rowIndex: row.rowIndex,
          reportDate: row.reportDate ?? new Date(),
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          adsetId: row.adsetId,
          adsetName: row.adsetName,
          adId: row.adId,
          adName: row.adName,
          subId: row.subIdNormalized,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          rawData: row.rawData,
        })),
        skipDuplicates: true,
      })

      // Luu vao ads_daily_stats
      await prisma.adsDailyStats.createMany({
        data: result.rows.map(row => ({
          reportDate: row.reportDate ?? new Date(),
          subIdRaw: row.subIdRaw ?? '',
          subIdNormalized: row.subIdNormalized ?? '',
          tkAff: row.tkAff,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          adsetId: row.adsetId,
          adsetName: row.adsetName,
          adId: row.adId,
          adName: row.adName,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
        })),
        skipDuplicates: true,
      })
    }

    await prisma.uploadedFile.update({
      where: { id: uploadedFile.id },
      data: { status: 'done' },
    })

    return NextResponse.json({
      success: true,
      uploadedFileId: uploadedFile.id,
      totalRows: result.totalRows,
      savedRows: result.rows.length,
      errorCount: result.errorCount,
      preview: result.preview.slice(0, 20),
      columnMapping: result.columnMapping,
    })
  } catch (err: any) {
    console.error('Upload ads error:', err)
    return NextResponse.json({ error: err.message || 'Loi server' }, { status: 500 })
  }
}
