-- MoneyQuest multiplayer, schema v1. Minimal data (CLAUDE.md "Kids' privacy"): teachers have an
-- email and a password hash; students are a class membership, a public name and progress summaries.
-- Times are Unix milliseconds. Deleting a class deletes everything in it (ON DELETE CASCADE).

CREATE TABLE teachers (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash   TEXT NOT NULL,
  salt        TEXT NOT NULL,
  iterations  INTEGER NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0,  -- set after an admin password reset
  created_at  INTEGER NOT NULL,
  last_login  INTEGER
);

-- Teacher sign-in sessions: only a SHA-256 of the token is stored.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  teacher_id  TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_teacher ON sessions(teacher_id);

-- Rate limits for login, sign-up and class-code guesses (key = kind:email or kind:ip).
CREATE TABLE attempts (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE classes (
  id                 TEXT PRIMARY KEY,
  teacher_id         TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  names_mode         TEXT NOT NULL DEFAULT 'generated' CHECK (names_mode IN ('generated', 'list')),
  world_mode         INTEGER NOT NULL DEFAULT 0,      -- off for new classes (decided 2026-11-07)
  goal_target        INTEGER NOT NULL DEFAULT 300,    -- correct answers per week
  leaderboard_hidden INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  last_active        INTEGER NOT NULL
);
CREATE INDEX classes_teacher ON classes(teacher_id);
CREATE INDEX classes_active ON classes(last_active);

-- A teacher's list of public names (used when names_mode = 'list').
CREATE TABLE class_names (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  PRIMARY KEY (class_id, name)
);

-- A student: a membership in one class. Only a SHA-256 of the device's token is stored.
CREATE TABLE members (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  public_name TEXT NOT NULL,
  muted       INTEGER NOT NULL DEFAULT 0,  -- teacher mute: emotes and phrases dropped
  world_muted INTEGER NOT NULL DEFAULT 0,  -- admin mute from world mode
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  UNIQUE (class_id, public_name)
);
CREATE INDEX members_class ON members(class_id);

-- Progress summaries uploaded by the game (the full save stays on the device).
CREATE TABLE progress (
  member_id    TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  level        INTEGER NOT NULL DEFAULT 1,
  xp           INTEGER NOT NULL DEFAULT 0,
  coins_earned INTEGER NOT NULL DEFAULT 0,
  zones        TEXT NOT NULL DEFAULT '[]',   -- JSON: zones cleared
  accuracy     TEXT NOT NULL DEFAULT '{}',   -- JSON: per topic { answered, correct }
  mc_form      TEXT,
  mc_pre       TEXT,                         -- JSON CheckResult or NULL
  mc_post      TEXT,
  updated_at   INTEGER NOT NULL
);

-- Class goal: correct answers per class per week (week = Monday's date, UTC).
CREATE TABLE goal_weeks (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  week     TEXT NOT NULL,
  correct  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (class_id, week)
);

-- Reports about a player: emote/phrase numbers only (no free text exists). Deleted after 90 days.
CREATE TABLE reports (
  id              TEXT PRIMARY KEY,
  reporter_id     TEXT REFERENCES members(id) ON DELETE SET NULL,
  reporter_class  TEXT REFERENCES classes(id) ON DELETE CASCADE,
  target_id       TEXT REFERENCES members(id) ON DELETE SET NULL,
  target_class    TEXT REFERENCES classes(id) ON DELETE CASCADE,
  world           INTEGER NOT NULL DEFAULT 0,
  history         TEXT NOT NULL DEFAULT '[]',  -- JSON: [{ kind: 'emote'|'phrase', i, at }]
  created_at      INTEGER NOT NULL,
  resolved        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX reports_created ON reports(created_at);

-- Printed reward codes redeemed anywhere (each works once across all devices).
CREATE TABLE redemptions (
  code        TEXT PRIMARY KEY,
  redeemed_at INTEGER NOT NULL
);
