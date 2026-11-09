-- Phase 4: the class goal counts the increase in each student's all-time correct answers between
-- uploads (so a retried upload never counts twice), and teachers can give a student a one-time
-- device code to move their class membership to a new device. Only hashes of codes are stored.

ALTER TABLE progress ADD COLUMN correct_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE members ADD COLUMN rejoin_hash TEXT;
ALTER TABLE members ADD COLUMN rejoin_expires INTEGER;
CREATE UNIQUE INDEX members_rejoin ON members(rejoin_hash);
