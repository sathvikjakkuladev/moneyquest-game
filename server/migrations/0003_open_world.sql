-- Open world: anyone who opens the game without a class code joins the shared world as a guest.
-- A guest is only a random token (stored hashed), a generated name and when it was last seen.
CREATE TABLE guests (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  public_name TEXT NOT NULL,
  blocked     INTEGER NOT NULL DEFAULT 0, -- the NHSQA admin blocked this guest from the open world
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);
CREATE INDEX guests_seen ON guests(last_seen);

-- World reports can now name guests (who have no class or member row).
ALTER TABLE reports ADD COLUMN reporter_guest TEXT;
ALTER TABLE reports ADD COLUMN target_guest TEXT;
