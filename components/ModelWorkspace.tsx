'use client';

import { ChangeEvent, Component, DragEvent, ErrorInfo, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { Bounds, ContactShadows, Grid, Html, OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
  Box, CheckCircle2, ChevronDown, Download, Expand, FileBox, FolderOpen,
  Grid2X2, Layers3, LoaderCircle, Maximize2, Minimize2, Pause, Play,
  RotateCcw, RotateCw, Settings2, UploadCloud, WandSparkles, ZoomIn, ZoomOut,
} from 'lucide-react';

type Asset = {
  id: string; original_name: string; stored_name: string; format: string;
  size: number; status: string; preview_name?: string; optimized_name?: string;
  optimized_size?: number; conversion_error?: string;
};
type ModelStats = { meshes: number; vertices: number; triangles: number; materials: number; textures: number };

const VIEWABLE_FORMATS = new Set(['glb', 'gltf', 'fbx', 'obj', 'stl', 'usdz']);
const ACCEPTED_FORMATS = new Set([...VIEWABLE_FORMATS, 'blend']);
const formatBytes = (bytes?: number) => !bytes ? '—' : bytes < 1024 * 1024
  ? `${Math.round(bytes / 1024)} KB`
  : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const formatNumber = (value?: number) => value === undefined ? '—' : new Intl.NumberFormat().format(value);
const assetPreviewUrl = (asset: Asset) => {
  const name = asset.preview_name || (VIEWABLE_FORMATS.has(asset.format) ? asset.stored_name : '');
  return name ? `/api/files/${encodeURIComponent(name)}` : null;
};

function inspectObject(object: THREE.Object3D): ModelStats {
  const stats = { meshes: 0, vertices: 0, triangles: 0, materials: 0, textures: 0 };
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    stats.meshes += 1;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    stats.vertices += position.count;
    stats.triangles += Math.floor((mesh.geometry.index?.count ?? position.count) / 3);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach(material => {
      if (!material) return;
      materials.add(material);
      Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
    });
  });
  stats.materials = materials.size;
  stats.textures = textures.size;
  return stats;
}

function ObjectModel({ object, onStats }: { object: THREE.Object3D; onStats: (stats: ModelStats) => void }) {
  const clone = useMemo(() => object.clone(true), [object]);
  useEffect(() => onStats(inspectObject(clone)), [clone, onStats]);
  return <primitive object={clone} />;
}

function GLTFModel({ url, onStats }: { url: string; onStats: (stats: ModelStats) => void }) {
  const gltf = useLoader(GLTFLoader, url);
  return <ObjectModel object={gltf.scene} onStats={onStats} />;
}
function FBXModel({ url, onStats }: { url: string; onStats: (stats: ModelStats) => void }) {
  const object = useLoader(FBXLoader, url);
  return <ObjectModel object={object} onStats={onStats} />;
}
function OBJModel({ url, onStats }: { url: string; onStats: (stats: ModelStats) => void }) {
  const object = useLoader(OBJLoader, url);
  return <ObjectModel object={object} onStats={onStats} />;
}
function USDZModel({ url, onStats }: { url: string; onStats: (stats: ModelStats) => void }) {
  const object = useLoader(USDZLoader, url);
  return <ObjectModel object={object} onStats={onStats} />;
}
function STLModel({ url, onStats }: { url: string; onStats: (stats: ModelStats) => void }) {
  const geometry = useLoader(STLLoader, url);
  useEffect(() => {
    const vertices = geometry.getAttribute('position')?.count ?? 0;
    onStats({ meshes: 1, vertices, triangles: Math.floor((geometry.index?.count ?? vertices) / 3), materials: 1, textures: 0 });
  }, [geometry, onStats]);
  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color="#5f8fe8" roughness={0.48} metalness={0.08} /></mesh>;
}

function UniversalModel({ url, format, onStats }: { url: string; format: string; onStats: (stats: ModelStats) => void }) {
  if (format === 'fbx') return <FBXModel url={url} onStats={onStats} />;
  if (format === 'obj') return <OBJModel url={url} onStats={onStats} />;
  if (format === 'stl') return <STLModel url={url} onStats={onStats} />;
  if (format === 'usdz') return <USDZModel url={url} onStats={onStats} />;
  return <GLTFModel url={url} onStats={onStats} />;
}

function CameraActions({ zoomStep, resetStep, controlsRef }: { zoomStep: number; resetStep: number; controlsRef: React.RefObject<OrbitControlsImpl> }) {
  const { camera } = useThree();
  const previousZoom = useRef(zoomStep);
  const previousReset = useRef(resetStep);
  useEffect(() => {
    if (previousZoom.current === zoomStep) return;
    camera.position.multiplyScalar(zoomStep > previousZoom.current ? 0.78 : 1.28);
    camera.updateProjectionMatrix();
    controlsRef.current?.update();
    previousZoom.current = zoomStep;
  }, [camera, controlsRef, zoomStep]);
  useEffect(() => {
    if (previousReset.current === resetStep) return;
    controlsRef.current?.reset();
    previousReset.current = resetStep;
  }, [controlsRef, resetStep]);
  return null;
}

class ViewerErrorBoundary extends Component<{ children: ReactNode; resetKey: string; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
    this.props.onError('This file could not be displayed. Try exporting it as a self-contained GLB file.');
  }
  componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() { return this.state.failed ? null : this.props.children; }
}

function LoadingModel() {
  return <Html center><div className="model-loading"><LoaderCircle className="spin" size={22} aria-hidden="true" /> Loading model…</div></Html>;
}

function ModelScene({ url, format, autoRotate, modelRotation, zoomStep, resetStep, onStats, onError }: {
  url: string; format: string; autoRotate: boolean; modelRotation: number; zoomStep: number;
  resetStep: number; onStats: (stats: ModelStats) => void; onError: (message: string) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  return <Canvas
    shadows
    dpr={[1, 2]}
    camera={{ position: [3.5, 2.4, 4.8], fov: 42, near: 0.01, far: 1000 }}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    onCreated={({ gl }) => {
      gl.domElement.setAttribute('role', 'img');
      gl.domElement.setAttribute('aria-label', 'Interactive 3D model viewer. Drag to rotate, scroll or pinch to zoom.');
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.18;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}
  >
    <color attach="background" args={['#25272c']} />
    <ambientLight intensity={0.72} />
    <hemisphereLight intensity={1.05} color="#dce7ff" groundColor="#18191d" />
    <directionalLight position={[4, 7, 4]} intensity={3.2} color="#fff3e7" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
    <directionalLight position={[-5, 2, -4]} intensity={1.5} color="#7ca7ff" />
    <directionalLight position={[0, -2, 5]} intensity={0.65} color="#ff9b61" />
    <ViewerErrorBoundary resetKey={url} onError={onError}>
      <Suspense fallback={<LoadingModel />}>
        <Bounds fit clip observe margin={1.3}>
          <group rotation={[0, modelRotation, 0]}><UniversalModel url={url} format={format} onStats={onStats} /></group>
        </Bounds>
      </Suspense>
    </ViewerErrorBoundary>
    <Grid position={[0, -1.32, 0]} infiniteGrid cellSize={0.5} sectionSize={5} cellColor="#45484f" sectionColor="#686d77" fadeDistance={28} fadeStrength={1.3} />
    <ContactShadows position={[0, -1.3, 0]} opacity={0.48} color="#090a0c" blur={2.8} far={5} />
    <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} autoRotate={autoRotate} autoRotateSpeed={1.8} enablePan minDistance={0.4} maxDistance={30} />
    <CameraActions zoomStep={zoomStep} resetStep={resetStep} controlsRef={controlsRef} />
  </Canvas>;
}

export default function ModelWorkspace() {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [quality, setQuality] = useState(72);
  const [message, setMessage] = useState('');
  const [viewerError, setViewerError] = useState('');
  const [autoRotate, setAutoRotate] = useState(false);
  const [modelRotation, setModelRotation] = useState(0);
  const [zoomStep, setZoomStep] = useState(0);
  const [resetStep, setResetStep] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/assets').then(response => response.json()).then((items: Asset[]) => {
      setAssets(items);
      const latest = items[0];
      if (latest) void prepareAsset(latest);
    }).catch(() => setMessage('The local asset library could not be loaded.'));
  }, []);
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const canPreview = Boolean(asset && previewUrl);
  const savedPercent = useMemo(() => asset?.optimized_size
    ? Math.max(0, Math.round((1 - asset.optimized_size / asset.size) * 100))
    : null, [asset]);

  async function upload(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ACCEPTED_FORMATS.has(ext)) {
      setMessage('Choose a GLB, GLTF, FBX, OBJ, STL, USDZ, or BLEND file.');
      return;
    }
    setUploading(true); setMessage(''); setViewerError(''); setStats(null); setModelRotation(0);
    const temporaryUrl = VIEWABLE_FORMATS.has(ext) ? URL.createObjectURL(file) : null;
    if (temporaryUrl) setPreviewUrl(temporaryUrl); else setPreviewUrl(null);
    const body = new FormData(); body.append('file', file);
    try {
      const response = await fetch('/api/assets', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAsset(data);
      setAssets(current => [data, ...current.filter(item => item.id !== data.id)]);
      if (temporaryUrl) {
        setPreviewUrl(`/api/files/${encodeURIComponent(data.stored_name)}`);
        URL.revokeObjectURL(temporaryUrl);
      }
      if (data.preview_name) {
        setPreviewUrl(`/api/files/${encodeURIComponent(data.preview_name)}`);
        setMessage('BLEND converted successfully. You can now rotate, view, and optimize it.');
      } else if (ext === 'blend') setMessage(data.conversion_error || 'BLEND file saved. Export it from Blender as GLB if automatic conversion fails.');
      else setMessage('Model imported. Drag it to rotate, scroll to zoom, or use the simple controls below.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
      setPreviewUrl(null);
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    } finally { setUploading(false); }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void upload(file);
    event.target.value = '';
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); event.stopPropagation(); setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }
  async function prepareAsset(item: Asset) {
    setAsset(item); setStats(null); setViewerError(''); setMessage(''); setModelRotation(0);
    const availablePreview = assetPreviewUrl(item);
    if (availablePreview) { setPreviewUrl(availablePreview); return; }
    setPreviewUrl(null);
    if (item.format !== 'blend') return;
    setUploading(true); setMessage('Converting the BLEND file into a browser-ready 3D preview…');
    try {
      const response = await fetch(`/api/assets/${item.id}/convert`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const updated = { ...item, preview_name: data.preview_name };
      setAsset(updated); setAssets(items => items.map(saved => saved.id === item.id ? updated : saved));
      setPreviewUrl(assetPreviewUrl(updated));
      setMessage('BLEND converted successfully. You can now view and optimize it.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'BLEND conversion failed.'); }
    finally { setUploading(false); }
  }
  function chooseAsset(item: Asset) { void prepareAsset(item); }
  function resetView() { setModelRotation(0); setResetStep(value => value + 1); }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewerRef.current?.requestFullscreen();
    } catch { setMessage('Fullscreen is not available in this browser.'); }
  }
  async function optimize() {
    if (!asset) return;
    setOptimizing(true); setMessage('Optimizing geometry and removing unused model data…');
    try {
      const response = await fetch(`/api/assets/${asset.id}/optimize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quality }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const updated = { ...asset, ...data };
      setAsset(updated); setAssets(items => items.map(item => item.id === asset.id ? updated : item));
      setMessage('Optimization complete. Your smaller Draco-compressed GLB is ready to download.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Optimization failed.'); }
    finally { setOptimizing(false); }
  }
  const download = () => { if (asset?.optimized_name) window.open(`/api/files/${encodeURIComponent(asset.optimized_name)}?download=1`, '_blank', 'noopener,noreferrer'); };

  return <div className="app-shell">
    <a className="skip-link" href="#workspace">Skip to viewer</a>
    <input ref={fileInputRef} className="file-input" type="file" accept=".glb,.gltf,.fbx,.obj,.stl,.usdz,.blend" onChange={onFile} />
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Box size={18} aria-hidden="true" /></span> MeshLab Studio</div>
      <nav className="nav" aria-label="Workspace navigation"><a className="active" href="#workspace"><Grid2X2 aria-hidden="true" /> Workspace</a><a href="#library"><FolderOpen aria-hidden="true" /> Asset library</a><a href="#settings"><Settings2 aria-hidden="true" /> Optimize</a></nav>
      <div className="storage"><p>LOCAL STORAGE</p><strong>{assets.length} asset{assets.length === 1 ? '' : 's'} saved</strong><div className="meter"><i /></div></div>
    </aside>
    <main className="main" id="workspace">
      <header className="topbar"><div><p className="eyebrow">3D asset workspace</p><h1>Inspect every detail.</h1><p className="subtitle">View textures and materials clearly, then create a lightweight web-ready model.</p></div><div className="top-actions"><button className="button primary" onClick={() => fileInputRef.current?.click()}><UploadCloud size={17} aria-hidden="true" /> Import model</button><button className="button secondary" onClick={download} disabled={!asset?.optimized_name}><Download size={17} aria-hidden="true" /> Download</button></div></header>
      <section className="workspace" aria-label="3D model workspace">
        <div className="viewer-column">
          <div className="panel viewer-panel">
            <div className="viewer-stage" ref={viewerRef}>
              <div className="grid-bg" />
              {canPreview && previewUrl ? <>
                <div className="viewer-head"><div className="file-pill"><span className="dot" /> <span>{asset?.original_name}</span></div><button className="icon-button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}</button></div>
                <ModelScene url={previewUrl} format={asset!.preview_name ? 'glb' : asset!.format} autoRotate={autoRotate} modelRotation={modelRotation} zoomStep={zoomStep} resetStep={resetStep} onStats={setStats} onError={setViewerError} />
                {viewerError && <div className="viewer-error" role="alert">{viewerError}</div>}
                <div className="viewer-hint"><RotateCw size={15} aria-hidden="true" /> Drag to rotate <span /> Scroll or pinch to zoom</div>
              </> : <div className="empty-viewer"><div><div className="empty-icon">{uploading ? <LoaderCircle className="spin" size={30} aria-hidden="true" /> : <Layers3 size={30} aria-hidden="true" />}</div><h2>{uploading ? 'Preparing your 3D model' : asset ? 'Preview needs GLB conversion' : 'Open your first 3D model'}</h2><p>{uploading ? 'This can take a moment for detailed BLEND files.' : asset ? 'Try importing a GLB export of this model.' : 'GLB is recommended. FBX, OBJ, STL, GLTF and USDZ also work.'}</p>{!uploading && <button className="button primary empty-button" onClick={() => fileInputRef.current?.click()}><UploadCloud size={17} aria-hidden="true" /> Choose 3D model</button>}</div></div>}
            </div>
            <div className="viewer-controls" aria-label="3D view controls">
              <div className="control-group"><button className="control-button" onClick={() => setModelRotation(value => value - Math.PI / 4)} disabled={!canPreview} aria-label="Rotate model left"><RotateCcw size={17} aria-hidden="true" /> Left</button><button className="control-button" onClick={() => setModelRotation(value => value + Math.PI / 4)} disabled={!canPreview} aria-label="Rotate model right"><RotateCw size={17} aria-hidden="true" /> Right</button></div>
              <div className="control-group"><button className="control-button icon-only" onClick={() => setZoomStep(value => value + 1)} disabled={!canPreview} aria-label="Zoom in" title="Zoom in"><ZoomIn size={18} /></button><button className="control-button icon-only" onClick={() => setZoomStep(value => value - 1)} disabled={!canPreview} aria-label="Zoom out" title="Zoom out"><ZoomOut size={18} /></button><button className="control-button" onClick={resetView} disabled={!canPreview}><Expand size={17} aria-hidden="true" /> Fit view</button></div>
              <button className={`control-button ${autoRotate ? 'selected' : ''}`} onClick={() => setAutoRotate(value => !value)} disabled={!canPreview} aria-pressed={autoRotate}>{autoRotate ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}{autoRotate ? 'Stop rotation' : 'Auto rotate'}</button>
              <button className="control-button fullscreen-control" onClick={() => void toggleFullscreen()} disabled={!canPreview}>{isFullscreen ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}{isFullscreen ? 'Exit full screen' : 'Full screen'}</button>
            </div>
            <div className={`dropzone ${dragging ? 'dragging' : ''}`} role="button" tabIndex={0} aria-label="Import a 3D model" onClick={() => fileInputRef.current?.click()} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click(); } }} onDrop={onDrop} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}>
              {uploading ? <LoaderCircle className="upload-icon spin" size={25} aria-hidden="true" /> : <UploadCloud className="upload-icon" size={25} aria-hidden="true" />}<div><strong>{uploading ? 'Importing your model…' : asset ? 'Open another model' : 'Drop a model here, or click to browse'}</strong><span>GLB recommended · up to 500 MB</span></div><div className="formats">GLB · GLTF · FBX · OBJ · STL · USDZ · BLEND</div>
            </div>
          </div>
        </div>
        <aside className="panel" id="settings">
          <div className="panel-title"><div><span className="step-number">2</span><h2>Optimize for the web</h2></div><ChevronDown size={16} aria-hidden="true" /></div>
          <div className="settings"><div className="setting"><div className="setting-row"><div><h3>Geometry compression</h3><p>Compress the mesh while keeping its shape.</p></div><span className="tag">ON</span></div></div><div className="setting"><div className="setting-row"><div><h3>Visual quality</h3><p>Higher quality creates a larger file.</p></div><b>{quality}%</b></div><input aria-label="Visual quality" type="range" min="30" max="100" value={quality} onChange={event => setQuality(+event.target.value)} /></div><div className="setting"><div className="setting-row"><div><h3>Clean unused data</h3><p>Remove duplicate and inactive model data.</p></div><span className="tag">ON</span></div></div><div className="summary">{asset ? <>Ready to optimize: <b>{asset.format === 'glb' || asset.preview_name ? asset.original_name : 'conversion required'}</b>.</> : <>Import a model to create a <b>smaller web-ready GLB</b>.</>}</div><button className="button orange optimize-action" onClick={() => void optimize()} disabled={!asset || (!asset.preview_name && asset.format !== 'glb') || optimizing}>{optimizing ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <WandSparkles size={17} aria-hidden="true" />}{optimizing ? 'Optimizing…' : 'Optimize to GLB'}</button></div>
          <div className="asset-info"><h2>Model information</h2><div className="stat-grid"><div className="stat"><small>FORMAT</small><b>{asset?.format?.toUpperCase() || '—'}</b></div><div className="stat"><small>FILE SIZE</small><b>{formatBytes(asset?.size)}</b></div><div className="stat"><small>MESHES</small><b>{formatNumber(stats?.meshes)}</b></div><div className="stat"><small>TRIANGLES</small><b>{formatNumber(stats?.triangles)}</b></div><div className="stat"><small>MATERIALS</small><b>{formatNumber(stats?.materials)}</b></div><div className="stat"><small>TEXTURES</small><b>{formatNumber(stats?.textures)}</b></div><div className="stat"><small>OPTIMIZED</small><b>{formatBytes(asset?.optimized_size)}</b></div><div className="stat"><small>SAVED</small><b>{savedPercent === null ? '—' : `${savedPercent}%`}</b></div></div>{message && <div className={`notice ${message.includes('complete') || message.includes('imported') ? 'success-notice' : ''}`} role="status">{message}</div>}</div>
        </aside>
      </section>
      <section className="library" id="library"><div className="library-header"><div><h2>Recent models</h2><p>Click a model to open it again.</p></div>{assets.length > 0 && <span className="asset-status">{assets.length} saved</span>}</div><div className="panel">{assets.length ? assets.slice(0, 5).map(item => <button className={`asset-row ${asset?.id === item.id ? 'selected-row' : ''}`} key={item.id} onClick={() => chooseAsset(item)}><span className="asset-icon"><FileBox size={19} aria-hidden="true" /></span><span className="asset-name"><strong>{item.original_name}</strong><small>{item.format.toUpperCase()} · {formatBytes(item.size)}</small></span>{item.status === 'optimized' ? <span className="asset-status"><CheckCircle2 size={12} aria-hidden="true" /> optimized</span> : <span className="asset-status neutral-status">original</span>}</button>) : <div className="asset-row empty-row">No models imported yet.</div>}</div></section>
    </main>
  </div>;
}
