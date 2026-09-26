# Notes de version

Ce fichier est la source des textes que les stores affichent aux membres. Il est
écrit **en français**, du point de vue de quelqu'un qui ouvre l'application — pas
du point de vue du dépôt : un membre ne sait pas ce qu'est un refactoring, et se
moque du numéro de PR.

Une section par version, la plus récente en haut. `## À paraître` recueille ce qui
a touché le binaire depuis la dernière bascule ; elle prend son numéro le jour de
la release.

Le texte d'une version part ensuite dans les trois champs que `eas submit` ne
remplit pas : **Nouveautés de cette version** sur l'App Store, **Éléments à
tester** dans TestFlight, **Notes de version** dans la Play Console. Il n'y va
plus à la main : `node scripts/store-notes.mjs` génère les trois fichiers que
fastlane téléverse, et `mobile/DISTRIBUTION.md` dit comment.

La Play Console n'accepte que 500 caractères, contre 4 000 pour l'App Store. Une
version qui dépasse porte une sous-section `### Play` : le texte court que Play
affichera. C'est un texte **écrit**, pas une troncature — la limite tombe au
milieu d'une phrase, et aucun de ces champs ne se corrige après publication sans
repasser une soumission. Sans cette sous-section, une version trop longue arrête
la release au lieu de partir coupée.

Les versions antérieures à la 1.2.0 sont décrites dans leur issue de release
(#435, #441, #471).

## À paraître

- **Un administrateur de club corrige l'e-mail et le téléphone d'un licencié
  depuis l'application.** La fiche joueur porte désormais une section
  Coordonnées avec son bouton Modifier, y compris pour quelqu'un qui n'en a
  aucune. C'était jusqu'ici réservé au site — or l'e-mail est l'adresse à
  laquelle arrive le code de connexion, donc une erreur y laissait un
  coéquipier à la porte.
- **Les groupes du club.** Bureau, jeunes, loisirs, entraîneurs : un
  administrateur crée les groupes de son club depuis l'onglet Club et y range
  les membres, un membre pouvant être dans plusieurs. Chacun filtre ensuite la
  liste des joueurs par groupe — dans au moins un des groupes choisis, ou dans
  tous — et la fiche d'un joueur dit dans quels groupes il est.

## 1.5.0 — 20 septembre 2026

Mettre son effectif à jour depuis le gymnase, et passer d'un match à l'autre
d'un geste.

- **Les licenciés s'importent depuis la FFTT dans l'application.** La liste du
  club s'ouvre un licencié par carte, qu'on feuillette au doigt : chaque champ
  se coche ou se décoche, et la carte entière s'ignore d'un geste. Un champ en
  tête cherche une licence précise, pour quelqu'un qui vient d'arriver au club
  et lit son numéro à voix haute.
- **Un homonyme déjà au club est proposé plutôt qu'un doublon.** Quand la FFTT
  donne un numéro de licence différent de celui que le club avait noté,
  l'import propose de rattacher les deux au lieu de créer une seconde fiche —
  archives comprises, qui est justement où un doublon dort. Rien n'est
  rattaché tout seul : c'est une question, jamais une réponse.
- **On passe d'un match au suivant d'un balayage.** Depuis les journées, ce
  sont les autres matchs du club ce jour-là ; partout ailleurs, les matchs de
  l'équipe dans sa phase. Des points sous la carte disent où l'on en est.
- **La matrice des journées ouvre ce qu'elle nomme** : un nom ouvre la fiche du
  joueur, un en-tête celle de l'équipe.
- **Une ligne « Résumé » dit ce que la composition tient**, et signale celle
  qui nomme un joueur de trop ou de moins — y compris un joueur aligné depuis
  « Autres joueurs du club », qui n'apparaît dans aucune section.
- **La matrice se lit à la taille du web**, d'un à trois points de plus
  qu'avant sur chaque ligne.
- **Une fiche s'ouvre d'où qu'on vienne** : un tap dans la matrice ouvre la
  même fiche d'équipe que l'onglet Équipes, et un lien reçu ouvre l'écran
  qu'il nomme.
- **Un match joué hier n'est plus annoncé comme celui d'aujourd'hui.** Il
  tenait la tête de « Prochains matchs » jusqu'au dimanche suivant, en
  demandant une disponibilité pour une rencontre déjà jouée.
- **L'accueil ne liste plus que les journées de votre club**, et non le
  calendrier de tous les clubs de la base.
- **Ouvrir l'application sans réseau affiche vos données, et celles de personne
  d'autre** : la mémoire hors ligne est désormais rattachée au membre
  connecté, ce qui compte sur un téléphone que le club se passe.
- Le bandeau « Une mise à jour est disponible » se distingue enfin de
  l'en-tête qu'il surplombe.

### Play

Mettre son effectif à jour depuis le gymnase, et passer d'un match à l'autre
d'un geste.

- Les licenciés s'importent depuis la FFTT, un par carte, avec la recherche
  par numéro de licence.
- Un homonyme déjà au club est proposé plutôt qu'un doublon.
- Un balayage passe d'un match au suivant.
- La matrice des journées ouvre ses noms et résume la composition.
- L'accueil ne liste que les journées de votre club, et un match déjà joué
  n'y est plus annoncé comme prochain.

## 1.4.1 — 14 septembre 2026

- **La fiche d'un licencié indique son brûlage.** L'aperçu rapide et la matrice
  des journées le disaient déjà ; la fiche, non — alors que c'est l'écran qu'on
  ouvre justement pour savoir si on peut aligner quelqu'un.
- **Les champs de recherche s'écrivent droit sur iPhone et iPad.** « Rechercher
  un joueur » s'affichait lettre par lettre, espacée, dans la composition d'une
  équipe, sur la fiche d'une équipe et dans la matrice des journées.
- **Les onglets du bas ont un nom.** VoiceOver annonçait cinq boutons sans
  intitulé ; il lit maintenant Accueil, Club, Équipes, Journées et Joueurs.

### Play

La fiche d'un licencié indique désormais son brûlage, comme le faisaient déjà
l'aperçu rapide et la matrice des journées. Les champs de recherche s'affichent
correctement sur iPhone et iPad, au lieu d'espacer les lettres de leur texte
d'invite. Et les cinq onglets du bas ont un nom pour VoiceOver.

## 1.4.0 — 12 septembre 2026

Être prévenu, et une application qui tient sans réseau.

- L'application prévient désormais sur votre téléphone. Une semaine avant chaque
  match, chaque joueur de l'équipe reçoit une demande de disponibilité — et
  ceux qui rejoignent l'effectif entre-temps la reçoivent aussi.
- Les capitaines sont prévenus quand une disponibilité déjà donnée change dans
  les sept jours qui précèdent le match. Une première réponse ne déclenche rien :
  seul un changement d'avis remonte.
- Une notification ouvre directement le match concerné.
- Mon compte : un interrupteur pour tout couper.
- Ouvrir l'application sans réseau ne vous déconnecte plus. Elle affiche ce
  qu'elle a en mémoire — ce qui est précisément l'usage en salle, où il n'y a
  pas de signal.
- Composer une équipe ne propose plus que les joueurs que la compétition admet,
  sur la matrice des journées comme sur la feuille de match, et signale ceux
  qu'un effectif retient déjà sans qu'ils y soient éligibles.
- L'email et le téléphone d'un joueur se copient d'un geste, sur sa fiche comme
  sur Mon compte. Le numéro ouvre toujours WhatsApp quand on tape dessus.
- L'application signale qu'une mise à jour est disponible.

### Play

Être prévenu, et une application qui tient sans réseau.

- Une demande de disponibilité arrive sur votre téléphone une semaine avant
  chaque match, et les capitaines sont prévenus quand une disponibilité change.
  Un interrupteur dans Mon compte coupe tout.
- Ouvrir l'application sans réseau ne vous déconnecte plus : elle affiche ce
  qu'elle a en mémoire.
- Composer une équipe ne propose que les joueurs que la compétition admet.
- L'email et le téléphone d'un joueur se copient d'un geste.

## 1.3.0 — 9 septembre 2026

Les licences sous les yeux du capitaine.

- Un joueur dont la licence n'est pas validée pour la saison porte un tag **Sans
  licence** partout où son nom apparaît — liste, fiche, effectif d'équipe, feuille
  de composition — et l'aligner affiche un avertissement, au moment de composer
  comme sur une composition déjà enregistrée. Rien n'est interdit : un
  renouvellement en cours reste une affaire de club.
- La fiche d'un joueur affiche sa catégorie d'âge.
- Sur tablette, la matrice des journées montre aussi les autres joueurs du club,
  et plus seulement ceux déjà retenus.
- Les écrans sont dimensionnés avec les polices de la marque, ce qui corrige des
  textes coupés ou décalés d'un ou deux pixels.
- Face ID demande son autorisation en français.

### Play

Les licences sous les yeux du capitaine.

- Un joueur dont la licence n'est pas validée porte un tag « Sans licence »
  partout où son nom apparaît, et l'aligner affiche un avertissement. Rien n'est
  interdit : un renouvellement en cours reste une affaire de club.
- La fiche d'un joueur affiche sa catégorie d'âge.
- Sur tablette, la matrice des journées montre aussi les autres joueurs du club.
- Face ID demande son autorisation en français, et des textes coupés ou décalés
  sont corrigés.

## 1.2.0 — 28 août 2026

L'application sur tablette.

- L'application tourne : plein écran sur iPad, mode paysage, encoches respectées.
- En paysage, la navigation passe le long du bord gauche ; **Équipes** et
  **Joueurs** affichent la fiche à côté de leur liste, sans aller-retour.
- **Journées** devient la grille du web : les joueurs en lignes, deux ou trois
  journées en colonnes, disponibilités et compositions modifiables sur place.
- Le choix d'un joueur écarte les licenciés archivés et se filtre par nom.
- L'en-tête d'une journée décrit les matchs listés en dessous.
- Répondre pour un coéquipier suit la règle des disponibilités.

Sur téléphone, rien ne change : mêmes écrans, même barre en bas, mêmes gestes.

### Play

L'application sur tablette.

- Plein écran sur iPad, mode paysage, encoches respectées.
- En paysage, la navigation passe le long du bord gauche ; **Équipes** et
  **Joueurs** affichent la fiche à côté de leur liste.
- **Journées** devient la grille du web : joueurs en lignes, journées en
  colonnes, disponibilités et compositions modifiables sur place.
- Le choix d'un joueur écarte les licenciés archivés et se filtre par nom.

Sur téléphone, rien ne change.
