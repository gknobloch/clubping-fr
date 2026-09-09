# Notes de version

Ce fichier est la source des textes que les stores affichent aux membres. Il est
écrit **en français**, du point de vue de quelqu'un qui ouvre l'application — pas
du point de vue du dépôt : un membre ne sait pas ce qu'est un refactoring, et se
moque du numéro de PR.

Une section par version, la plus récente en haut. `## À paraître` recueille ce qui
a touché le binaire depuis la dernière bascule ; elle prend son numéro le jour de
la release.

Le texte d'une version part ensuite, tel quel, dans les trois champs que `eas
submit` ne remplit pas : **Nouveautés de cette version** sur l'App Store,
**Éléments à tester** dans TestFlight, **Notes de version** dans la Play Console.
`mobile/DISTRIBUTION.md` dit où ils se trouvent et ce que chacun accepte.

Les versions antérieures à la 1.2.0 sont décrites dans leur issue de release
(#435, #441, #471).

## À paraître

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
