-- backend/schema.sql
-- D1 schema for scheduled posts
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT,
  image_url TEXT NOT NULL,
  caption TEXT,
  hashtags TEXT,
  platforms TEXT NOT NULL, -- comma-separated: fb,ig
  scheduled_at INTEGER NOT NULL, -- unix seconds
  status TEXT NOT NULL, -- draft | scheduled | published | failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_status_scheduled ON posts (status, scheduled_at);
