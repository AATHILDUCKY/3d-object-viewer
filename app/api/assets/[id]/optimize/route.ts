import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import db from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(params.id) as Record<string, unknown> | undefined;
  if (!asset) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  const inputName = asset.format === 'glb' ? asset.stored_name : asset.preview_name;
  if (!inputName) return NextResponse.json({ error: 'Convert this model to GLB before optimizing it.' }, { status: 422 });
  try {
    const settings = await request.json().catch(() => ({ quality: 72 }));
    const quality = Math.min(100, Math.max(30, Number(settings.quality) || 72));
    const positionBits = Math.round(10 + (quality - 30) / 12);
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });
    let input = path.join(process.cwd(), 'data', 'uploads', String(inputName));
    try { await fs.access(input); } catch { input = path.join(process.cwd(), 'public', 'uploads', String(inputName)); }
    const outputName = `${params.id}-optimized.glb`;
    const output = path.join(process.cwd(), 'data', 'uploads', outputName);
    const document = await io.read(input);
    await document.transform(dedup(), prune(), draco({ method: 'edgebreaker', encodeSpeed: 7, decodeSpeed: 5, quantizePosition: positionBits }));
    await io.write(output, document);
    const optimizedSize = (await fs.stat(output)).size;
    db.prepare("UPDATE assets SET status = 'optimized', optimized_name = ?, optimized_size = ? WHERE id = ?")
      .run(outputName, optimizedSize, params.id);
    return NextResponse.json({ optimized_name: outputName, optimized_size: optimizedSize, status: 'optimized' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'The model could not be optimized. Ensure it is a valid GLB asset.' }, { status: 422 });
  }
}
