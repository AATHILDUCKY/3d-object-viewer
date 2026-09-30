import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';

async function existingSource(name: string) {
  const locations = [
    path.join(process.cwd(), 'data', 'uploads', name),
    path.join(process.cwd(), 'public', 'uploads', name),
  ];
  for (const location of locations) {
    try { await fs.access(location); return location; } catch { /* Try the legacy location. */ }
  }
  throw new Error('The original model file is missing.');
}

export async function convertBlendToGlb(id: string, storedName: string) {
  const source = await existingSource(storedName);
  const uploadDir = path.join(process.cwd(), 'data', 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  const previewName = `${id}-preview.glb`;
  const output = path.join(uploadDir, previewName);
  const pythonDependencies = path.join(process.cwd(), 'data', 'blender-python');
  const expression = `import sys; sys.path.insert(0, ${JSON.stringify(pythonDependencies)}); import bpy; bpy.ops.export_scene.gltf(filepath=${JSON.stringify(output)}, export_format='GLB', export_apply=True)`;

  await new Promise<void>((resolve, reject) => {
    const process = spawn('/usr/bin/blender', ['--background', '--disable-autoexec', source, '--python-expr', expression], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errorText = '';
    const timeout = setTimeout(() => { process.kill('SIGTERM'); reject(new Error('Model conversion timed out.')); }, 5 * 60 * 1000);
    process.stderr.on('data', chunk => { errorText += String(chunk).slice(-4000); });
    process.on('error', error => { clearTimeout(timeout); reject(error); });
    process.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(errorText || `Blender conversion stopped with code ${code}.`));
    });
  });
  await fs.access(output);
  const document = await new NodeIO().read(output);
  if (document.getRoot().listMeshes().length === 0) {
    await fs.unlink(output).catch(() => undefined);
    throw new Error('This BLEND file contains no mesh objects. Add or restore the model geometry in Blender, save it, and import it again.');
  }
  return previewName;
}
