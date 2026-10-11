CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('Kesalahan materi', 'Masalah website', 'Saran fitur', 'Lainnya')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 2000),
  source_page TEXT NOT NULL DEFAULT 'home' CHECK (source_page IN ('login', 'home')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
