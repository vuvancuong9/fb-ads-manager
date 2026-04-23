import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseOrderFile } from '@/lib/parser/order-parser'
import { createHash } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Khong co file' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileHash = createHash('sha256').update(buffer).digest('hex')

    const existing = await prisma.uploadedFile.findUnique({ where: { fileHash } })
    if (existing) {
      return NextResponse.json({ error: 'File nay da duoc upload truoc do', uploadedFileId: existing.id }, { status: 409 })
    }

    const result = await parseOrderFile(buffer, file.name)
    const reportDate = result.rows[0]?.reportDate ?? result.errorRows[0]?.reportDate ?? new Date()

    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        fileName: file.name,
        fileHash,
        fileType: 'orders',
        reportDate,
        rowCount: result.totalRows,
        errorCount: result.errorCount,
        status: 'processing',
      },
    })

    if (result.rows.length > 0) {
      await prisma.rawOrderRow.createMany({
        data: result.rows.map(row => ({
          uploadedFileId: uploadedFile.id,
          rowIndex: row.rowIndex,
          reportDate: row.reportDate ?? new Date(),
          orderId: row.orderId,
          subId: row.subIdRaw,
          tkAff: row.tkAff,
          commission: row.commission,
          orderAmount: row.orderAmount,
          status: row.status,
          rawData: row.rawData,
        })),
        skipDuplicates: true,
      })

      await prisma.order.createMany({
        data: result.rows.map(row => ({
          reportDate: row.reportDate ?? new Date(),
          orderId: row.orderId,
          subIdRaw: row.subIdRaw ?? '',
          subIdNormalized: row.subIdNormalized ?? '',
          tkAff: row.tkAff,
          commission: row.commission,
          orderAmount: row.orderAmount,
          status: row.status,
        })),
        skipDuplicates: true,
      })
    }

    await prisma.uploadedFile.update({ where: { id: uploadedFile.id }, data: { status: 'done' } })

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
    return NextResponse.json({ error: err.message || 'Loi server' }, { status: 500 })
  }
}
