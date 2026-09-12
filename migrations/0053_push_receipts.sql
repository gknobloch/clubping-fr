-- 0053 — vérifier ce qu'Expo a réellement livré (#495)
--
--   push_receipts  PRIMARY KEY (ticket_id)
--
-- Expo répond deux fois à un envoi, et la première réponse ne veut rien dire.
-- Le *ticket*, immédiat, dit seulement « message accepté pour traitement ». Le
-- verdict est dans le *reçu*, disponible quelques secondes à quelques minutes
-- plus tard, et c'est là que se trouvent les refus d'APNs et de FCM : clé de
-- compte de service du mauvais projet, API désactivée, jeton révoqué.
--
-- Le dispatcher ne lisait que le ticket. Il a donc annoncé « sent: 1 », inscrit
-- la ligne de registre qui garantit qu'on ne redemandera jamais, et FCM avait
-- rejeté le message. Ce n'est pas un échec silencieux, c'est un succès affirmé
-- à tort — la seule variété qu'aucune alerte ne rattrape.
--
-- Un worker ne peut pas attendre le reçu : il répond et meurt. Les tickets sont
-- donc consignés ici, et le balayage du lendemain commence par les relever.
-- Une journée de retard sur un diagnostic n'est rien face à une saison de
-- silence, et Expo garde les reçus 24 h — au-delà, la ligne est purgée sans
-- verdict plutôt que gardée indéfiniment.
--
-- `user_id` et `game_id` sont NULLABLE : ils nomment la ligne de
-- `notifications_sent` que cette livraison était censée honorer, et l'alerte
-- capitaine n'en a aucune. Quand ils sont là et que le reçu est en erreur, la
-- ligne de registre est supprimée — le rappel n'a pas été reçu, il est donc de
-- nouveau dû. La fenêtre de sept jours borne d'elle-même ces reprises, et un
-- appareil définitivement mort voit son jeton supprimé, donc rien ne boucle.
--
-- Pas de REFERENCES sur `token` : un jeton purgé entre l'envoi et le relevé ne
-- doit pas emporter la preuve de ce qui lui est arrivé.

CREATE TABLE IF NOT EXISTS push_receipts (
  ticket_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  kind TEXT,
  user_id TEXT,
  game_id TEXT,
  queued_at INTEGER NOT NULL
);

-- Le relevé lit par ancienneté, et purge au-delà de 24 h.
CREATE INDEX IF NOT EXISTS idx_push_receipts_queued ON push_receipts(queued_at);
