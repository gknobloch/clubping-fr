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
