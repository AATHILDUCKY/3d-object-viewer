import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MeshLab Studio — 3D optimizer',
  description: 'Inspect, optimize, and export 3D assets.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
