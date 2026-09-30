import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const MIME_TYPES: Record<string, string> = {
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', fbx: 'application/octet-stream',
  obj: 'text/plain', stl: 'model/stl', usdz: 'model/vnd.usdz+zip',
};

export async function GET(request: Request, { params }: { params: { name: string } }) {
  const name = path.basename(params.name);
  if (!name || name !== params.name) return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 });

  const locations = [
    path.join(process.cwd(), 'data', 'uploads', name),
    path.join(process.cwd(), 'public', 'uploads', name),
  ];
  let file: Buffer | null = null;
  for (const location of locations) {
    try { file = await fs.readFile(location); break; } catch { /* Check the legacy location next. */ }
  }
  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 });

  const extension = path.extname(name).slice(1).toLowerCase();
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new NextResponse(new Blob([new Uint8Array(file)]), {
    headers: {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Content-Length': String(file.byteLength),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
