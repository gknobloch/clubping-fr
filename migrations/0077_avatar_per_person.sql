-- #741 — one photo per person, not per club profile.
--
-- `user_avatars` stays keyed by profile, and is read through the person: a
-- profile shows the most recent photo among its person's profiles, and setting
-- one removes the others. This brings what is already stored in line: where a
-- person has photos on several profiles — set at Rixheim and again at Landser —
-- the most recent is kept (ties by profile id, to keep exactly one).
--
-- Data only, one deploy. Between this and the worker swap, the old worker reads
-- photos by profile: a profile whose photo lived on a sibling shows initials
-- for a minute or two.
DELETE FROM user_avatars
 WHERE user_id IN (
   SELECT a.user_id
     FROM user_avatars a
     JOIN users u ON u.id = a.user_id
    WHERE u.person_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_avatars b JOIN users v ON v.id = b.user_id
         WHERE v.person_id = u.person_id
           AND (b.updated_at > a.updated_at OR (b.updated_at = a.updated_at AND b.user_id > a.user_id))
      )
 );
