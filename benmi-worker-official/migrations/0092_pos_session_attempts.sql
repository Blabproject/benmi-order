-- Shared POS PIN login throttling, independent of order lifecycle migrations.
CREATE TABLE IF NOT EXISTS pos_session_attempts (
 scope TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL CHECK(attempts>0)
);
