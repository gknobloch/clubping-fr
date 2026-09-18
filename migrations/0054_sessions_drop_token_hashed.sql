-- 0054 — fin de #410 : plus aucun jeton de session en clair, et plus de colonne
-- pour dire lequel l'est.
--
-- 0041 s'était mise à stocker `sha256(token)` en marquant la forme de chaque
-- ligne dans `token_hashed`, et acceptait les deux le temps que les lignes
-- d'avant expirent : D1 n'expose aucune fonction de hachage, l'empreinte ne se
-- dérive pas d'une valeur qu'on ne garde plus, et supprimer ces lignes aurait
-- renvoyé tout le club sur l'écran de connexion.
--
-- L'attente est finie. L'étape 1 est en production depuis le 19/08/2026 à
-- 06:07:50 UTC, ce qui plaçait au pire l'expiration de la dernière ligne en
-- clair au 18/09 à 06:07:50 UTC ; la dernière encore vivante a expiré le 17/09
-- à 16:36:58 UTC. Relevé avant d'écrire ce fichier : zéro ligne en clair
-- vivante, 28 lignes mortes. Personne n'est déconnecté.
--
-- ATTENTION — le tri se fait sur l'expiration, PAS sur `token_hashed = 0`.
-- L'étape 3a (ne plus lire la colonne) est déployée avant celle-ci, et son
-- INSERT ne nomme plus `token_hashed` : les sessions créées entre les deux
-- déploiements portent donc une EMPREINTE avec le drapeau à 0, que leur
-- DEFAULT leur a donné. Les supprimer sur ce critère déconnecterait
-- exactement les membres qui se sont connectés entre-temps — la panne que
-- toute cette transition existe pour éviter. L'expiration, elle, dit la seule
-- chose qui compte : la ligne est morte.
--
-- Ce balayage est celui de #409, appliqué une fois à toute la table plutôt
-- qu'au membre qui se connecte.
--
-- Rejouable : le DELETE et la reconstruction le sont l'un comme l'autre, et
-- wrangler n'applique de toute façon chaque fichier qu'une fois (#312).

DELETE FROM sessions WHERE expires_at <= unixepoch() * 1000;

-- === sessions : supprimer token_hashed ===
--
-- SQLite n'a pas de DROP COLUMN ici, donc table de remplacement (comme 0038).
-- `token` ne contient plus qu'une chose : l'empreinte.

CREATE TABLE sessions_new (
  token      TEXT PRIMARY KEY,        -- sha256(jeton), jamais le jeton
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,        -- unix epoch ms
  expires_at INTEGER NOT NULL         -- unix epoch ms
);

INSERT INTO sessions_new (token, user_id, created_at, expires_at)
SELECT token, user_id, created_at, expires_at
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
