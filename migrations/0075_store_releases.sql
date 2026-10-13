-- #708 — what each store actually serves.
--
-- `CLIENT_LATEST_VERSION` (#508) is raised in the release's bump PR, so it was
-- live days before Apple and Google had approved the build it named: members
-- were told an update existed, pressed it, and found the version they had.
-- `GET /api/client-version` now advertises the lower of that var and these
-- rows, written hourly by .github/workflows/store-versions.yml
-- (scripts/store-versions.mjs).
--
-- One row per platform. No row is "not known yet", which advertises nothing.
--
-- Additive, one deploy: the worker it replaces never names the table.
CREATE TABLE IF NOT EXISTS store_releases (
  platform TEXT PRIMARY KEY CHECK (platform IN ('ios', 'android')),
  version TEXT NOT NULL,
  checked_at TEXT NOT NULL
);
