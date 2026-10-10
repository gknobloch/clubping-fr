-- 0064 — delegation: who may open a person's profiles besides themselves (#655)
--
--   person_delegates   (person_id, delegate_id): `delegate_id` opens
--                      `person_id`'s club profiles as their own
--
-- Sacha has no address, so he cannot sign in: until now the answer was to give
-- him his father's (#640), which tied the two together by a string and cut
-- Benjamin off the day Sacha got an address of his own. A delegation says the
-- thing itself — Benjamin manages Sacha — and survives Sacha getting an address:
-- he signs in directly, and Benjamin still can while the delegation stands.
--
-- One level, by construction: a delegate reaches the profiles of the person
-- who delegated, never that person's own delegations. Several delegates per
-- person (two parents), several people per delegate (two children).
--
-- Cascades from `people` only: a person is never deleted while a profile names
-- them, so these go when 0063's cleanup or a merge removes a person, and not
-- otherwise.

CREATE TABLE IF NOT EXISTS person_delegates (
  person_id    TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  delegate_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (person_id, delegate_id),
  CHECK (person_id != delegate_id)
);

CREATE INDEX IF NOT EXISTS idx_person_delegates_delegate ON person_delegates (delegate_id);
