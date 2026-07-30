-- #294: record where a game's date and time came from.
--
--   games.source  'fftt' | 'document' | 'manual'  (NULL = unknown, pre-#294)
--
-- Why a single column and not a combined "document then cross-checked with
-- FFTT" value: that fact is already representable without a new state. Whether
-- FFTT knows a game is `game_id IS NOT NULL`; `source` records who last set
-- its slot. "Imported from a document, later confirmed against FFTT" is simply
-- source='document' with game_id set — no combinatorial enum, and no ambiguity
-- about which field answers which question.
--
-- What it is for: today nothing distinguishes a date an import guessed from
-- one a club admin agreed with an opponent ("hall unavailable, we play the day
-- after"). Both imports happen to skip games that already exist, so a manual
-- decision survives — by accident, not by design. As soon as an import is
-- allowed to refresh existing games (#294 does exactly that for the document
-- path, which is authoritative on day and time), a manual decision would be
-- silently overwritten. `source = 'manual'` is what makes it untouchable, and
-- what the UI marks so a human can see the slot was negotiated, not imported.
--
-- Backfill, best effort — provenance was never recorded, so it is inferred:
--   * a game carrying an FFTT match id came from the FFTT import
--   * a game whose derived id starts with game-doc- came from a document
--     (see gameIdFor + the schedule-document import's localId('md'))
--   * anything else stays NULL: created by hand, or by an import old enough
--     that neither marker applies. NULL is treated as "unknown", never as
--     "manual" — inferring a human decision that may not exist would be worse
--     than admitting we do not know.
--
-- Re-run safety: the ALTER fails once the column exists, rolling the whole
-- file back — same contract as 0023/0029/0031/0032.

ALTER TABLE games ADD COLUMN source TEXT;

UPDATE games SET source = 'fftt' WHERE game_id IS NOT NULL AND source IS NULL;

UPDATE games SET source = 'document'
WHERE source IS NULL AND id GLOB 'game-doc-*';
