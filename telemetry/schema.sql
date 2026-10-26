CREATE TABLE IF NOT EXISTS installs (
  install_id    TEXT PRIMARY KEY,
  first_run_day TEXT NOT NULL,
  last_seen_day TEXT NOT NULL,
  app_version   TEXT,
  os            TEXT,
  metrics       TEXT NOT NULL
);
