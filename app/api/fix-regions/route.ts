export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { detectRegionFromText } from '@/lib/placsp';

/**
 * POST /api/fix-regions — Update regionCcaa for all tenders with null/empty region
 * Uses the enhanced city/municipality mapping to detect regions from contracting body text.
 */
export async function POST() {
  try {
    // Get all tenders with null or empty regionCcaa
    const tenders = await prisma.tender.findMany({
      where: {
        OR: [
          { regionCcaa: null },
          { regionCcaa: '' },
        ],
      },
      select: {
        id: true,
        contractingBody: true,
        title: true,
        description: true,
      },
    });

    let updated = 0;
    const results: Array<{ id: string; body: string; region: string }> = [];

    for (const t of tenders) {
      const text = `${t.contractingBody || ''} ${t.title || ''} ${t.description || ''}`;
      const region = detectRegionFromText(text);

      if (region) {
        await prisma.tender.update({
          where: { id: t.id },
          data: { regionCcaa: region },
        });
        updated++;
        results.push({
          id: t.id,
          body: (t.contractingBody || '').substring(0, 60),
          region,
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: tenders.length,
      updated,
      stillNull: tenders.length - updated,
      updates: results,
    });
  } catch (error: any) {
    console.error('[fix-regions] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 });
  }
}
