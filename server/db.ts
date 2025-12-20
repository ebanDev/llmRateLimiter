import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";

mkdirSync("data", { recursive: true });

export const db = new Database("data/rate_limits.db", {
  create: true,
  readwrite: true,
  strict: true,
});

let schemaReady = false;

export const ensureSchema = () => {
  if (schemaReady) return;
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL;");
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA temp_store = MEMORY;");
  db.run("PRAGMA cache_size = -64000;");

  db.run(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      base_url TEXT NOT NULL,
      api_key TEXT,
      kind TEXT DEFAULT 'openai',
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      grade INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      supports_images INTEGER DEFAULT 0,
      openrouter_provider TEXT,
      active INTEGER DEFAULT 1,
      UNIQUE(provider_id, name)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      model_id INTEGER PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
      per_minute INTEGER,
      per_hour INTEGER,
      per_day INTEGER,
      per_month INTEGER,
      tokens_per_minute INTEGER,
      tokens_per_hour INTEGER,
      tokens_per_day INTEGER,
      tokens_per_month INTEGER
    );
    CREATE TABLE IF NOT EXISTS request_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
      ts INTEGER NOT NULL,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      kind TEXT DEFAULT 'completion'
    );
    CREATE TABLE IF NOT EXISTS search_providers (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      base_url TEXT NOT NULL,
      api_key TEXT,
      priority INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      per_minute INTEGER,
      per_hour INTEGER,
      per_day INTEGER,
      per_month INTEGER
    );
    CREATE TABLE IF NOT EXISTS search_request_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL REFERENCES search_providers(id) ON DELETE CASCADE,
      ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta_models (
      name TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS meta_model_targets (
      meta_name TEXT NOT NULL REFERENCES meta_models(name) ON DELETE CASCADE,
      model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      UNIQUE(meta_name, model_id)
    );
  `);

  // migrations
  try {
    db.run(`ALTER TABLE rate_limits ADD COLUMN per_month INTEGER`);
  } catch {}
  try {
    db.run(`ALTER TABLE rate_limits ADD COLUMN tokens_per_minute INTEGER`);
  } catch {}
  try {
    db.run(`ALTER TABLE rate_limits ADD COLUMN tokens_per_hour INTEGER`);
  } catch {}
  try {
    db.run(`ALTER TABLE rate_limits ADD COLUMN tokens_per_day INTEGER`);
  } catch {}
  try {
    db.run(`ALTER TABLE rate_limits ADD COLUMN tokens_per_month INTEGER`);
  } catch {}
  try {
    db.run(`ALTER TABLE request_log ADD COLUMN kind TEXT DEFAULT 'completion'`);
  } catch {}
  try {
    db.run(`ALTER TABLE models ADD COLUMN supports_images INTEGER DEFAULT 0`);
  } catch {}
  try {
    db.run(`ALTER TABLE models ADD COLUMN openrouter_provider TEXT`);
  } catch {}
  try {
    db.run(`ALTER TABLE providers ADD COLUMN kind TEXT DEFAULT 'openai'`);
  } catch {}
  try {
    db.run(`UPDATE providers SET kind = 'openrouter' WHERE id LIKE 'openrouter-%' AND (kind IS NULL OR kind = '')`);
  } catch {}
  try {
    db.run(`CREATE TABLE IF NOT EXISTS search_providers (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      base_url TEXT NOT NULL,
      api_key TEXT,
      priority INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      per_minute INTEGER,
      per_hour INTEGER,
      per_day INTEGER,
      per_month INTEGER
    )`);
  } catch {}
  try {
    db.run(`CREATE TABLE IF NOT EXISTS search_request_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL REFERENCES search_providers(id) ON DELETE CASCADE,
      ts INTEGER NOT NULL
    )`);
  } catch {}


  schemaReady = true;
};
