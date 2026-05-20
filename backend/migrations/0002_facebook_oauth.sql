CREATE TABLE IF NOT EXISTS facebook_connections (
  profile_key TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  page_name TEXT,
  page_access_token TEXT NOT NULL,
  page_token_expires_at INTEGER,
  user_id TEXT,
  user_name TEXT,
  user_access_token TEXT,
  user_token_expires_at INTEGER,
  granted_permissions TEXT,
  missing_permissions TEXT,
  token_status TEXT NOT NULL DEFAULT 'unknown',
  reconnect_required INTEGER NOT NULL DEFAULT 0,
  last_checked_at INTEGER,
  last_error TEXT,
  alert_sent_at INTEGER,
  debug_payload TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS facebook_oauth_states (
  state TEXT PRIMARY KEY,
  profile_key TEXT NOT NULL,
  page_id TEXT,
  return_url TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta_maintenance (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);
