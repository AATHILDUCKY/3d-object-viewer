import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import db from '@/lib/db';
import { ACCEPTED_FORMATS, extension, safeName } from '@/lib/assets';
import { convertBlendToGlb } from '@/lib/convert';

export const runtime = 'nodejs';

export async function GET() {
  const assets = db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all();
  return NextResponse.json(assets);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Please choose a file.' }, { status: 400 });
  const format = extension(file.name);
  if (!ACCEPTED_FORMATS.has(format)) return NextResponse.json({ error: 'Unsupported file format.' }, { status: 415 });
  if (file.size > 500 * 1024 * 1024) return NextResponse.json({ error: 'Files must be under 500 MB.' }, { status: 413 });
  const id = randomUUID(); const storedName = `${id}-${safeName(file.name)}`;
  const uploadDir = path.join(process.cwd(), 'data', 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, storedName), Buffer.from(await file.arrayBuffer()));
  db.prepare('INSERT INTO assets (id, original_name, stored_name, mime_type, size, format) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, file.name, storedName, file.type, file.size, format);
  let previewName: string | undefined;
  let conversionError: string | undefined;
  if (format === 'blend') {
    try {
      previewName = await convertBlendToGlb(id, storedName);
      db.prepare('UPDATE assets SET preview_name = ? WHERE id = ?').run(previewName, id);
    } catch (error) {
      console.error(error);
      conversionError = error instanceof Error && error.message.includes('no mesh objects')
        ? error.message
        : 'The BLEND file was saved, but automatic preview conversion failed.';
    }
  }
  return NextResponse.json({ id, original_name: file.name, stored_name: storedName, preview_name: previewName, format, size: file.size, status: 'original', conversion_error: conversionError });
}
