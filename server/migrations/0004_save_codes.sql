-- Save codes: a player can back up a save slot and bring it back on another device by typing a code
-- like SUNNY-OTTER-482173. Only a keyed hash of the code is stored. The save has no nickname and no
-- class membership in it (the game strips both before sending).
CREATE TABLE save_codes (
  id         TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL UNIQUE,
  data       TEXT NOT NULL,   -- JSON: { version, slot }
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX save_codes_updated ON save_codes(updated_at);
