# MeshLab Studio

A local Next.js workspace for importing, inspecting, optimizing, and exporting 3D assets.

## Run locally

```bash
npm install
npm run dev
```

Open the local address Next.js prints in the terminal. Use **Import 3D model** in the top-right corner, or click anywhere inside the large upload panel.

## Supported files

GLB, GLTF, FBX, OBJ, STL, and USDZ can be previewed in the interactive viewport. GLB files are optimized with Draco compression and unused-data cleanup.

When Blender is installed at `/usr/bin/blender`, BLEND files are automatically converted into a safe GLB preview with script auto-execution disabled. The original file is preserved. Models without mesh geometry receive a clear validation message instead of an empty viewer.
