-- 0073 — Organisations per federation; a division's organisation, and a
-- club's within a federation (#692).
--
-- `organizations` was a cache of the FFTT's list (0011), refreshed whole from
-- its API, and nothing of ours said which organisation runs a division: the
-- Divisions and Groupes filter asked the FFTT. The AGR has no API, and two
-- organisations — the Haut-Rhin and the Bas-Rhin committees —, so they are
-- written here, and stored where they apply:
--
--   * a DIVISION's organisation — not a competition's: at the FFTT one
--     championship holds the league's regional divisions and a committee's
--     departmental ones alike. The FFTT divisions import records the
--     organisation it imports for; the AGR calendar import, the one chosen;
--   * a CLUB's within a federation (`club_federations.organization_id`):
--     Landser is AGR Haut-Rhin. FFTT affiliations have no row there (#643).
--
-- Everything AGR so far is the Haut-Rhin's.

ALTER TABLE organizations ADD COLUMN federation_id TEXT NOT NULL DEFAULT 'fftt';

INSERT OR IGNORE INTO organizations (id, type, identifier, name, updated_at, federation_id) VALUES
  ('agr-68', 'Committee', '68', 'Haut-Rhin', datetime('now'), 'agr'),
  ('agr-67', 'Committee', '67', 'Bas-Rhin', datetime('now'), 'agr');

ALTER TABLE divisions ADD COLUMN organization_id TEXT;
ALTER TABLE club_federations ADD COLUMN organization_id TEXT;

UPDATE divisions SET organization_id = 'agr-68'
 WHERE organization_id IS NULL
   AND competition_id IN (SELECT id FROM competitions WHERE federation_id = 'agr');
UPDATE club_federations SET organization_id = 'agr-68'
 WHERE federation_id = 'agr' AND organization_id IS NULL;
