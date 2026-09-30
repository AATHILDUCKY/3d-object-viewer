import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'meshlab.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
  mime_type TEXT, size INTEGER NOT NULL, format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'original', preview_name TEXT, optimized_name TEXT,
  optimized_size INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
try { db.exec('ALTER TABLE assets ADD COLUMN preview_name TEXT'); } catch { /* Column already exists. */ }
export default db;
