import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { convertBlendToGlb } from '@/lib/convert';

export const runtime = 'nodejs';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(params.id) as Record<string, unknown> | undefined;
  if (!asset) return NextResponse.json({ error: 'Model not found.' }, { status: 404 });
  if (asset.preview_name) return NextResponse.json({ preview_name: asset.preview_name });
  if (asset.format !== 'blend') return NextResponse.json({ error: 'This model does not require conversion.' }, { status: 422 });
  try {
    const previewName = await convertBlendToGlb(params.id, String(asset.stored_name));
    db.prepare('UPDATE assets SET preview_name = ? WHERE id = ?').run(previewName, params.id);
    return NextResponse.json({ preview_name: previewName });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && error.message.includes('no mesh objects')
      ? error.message
      : 'The BLEND file could not be converted. Open it in Blender and export a GLB instead.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
