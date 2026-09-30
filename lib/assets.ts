import path from 'path';

export const PREVIEW_FORMATS = new Set(['glb', 'gltf']);
export const ACCEPTED_FORMATS = new Set(['glb', 'gltf', 'blend', 'fbx', 'obj', 'stl', 'usdz']);
export function extension(name: string) { return path.extname(name).slice(1).toLowerCase(); }
export function safeName(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, '_'); }
