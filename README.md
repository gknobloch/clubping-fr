# Ping Club — Application de disponibilités

Application web mobile-friendly pour la gestion des joueurs, équipes et disponibilités des matchs de tennis de table (voir [SPEC.md](docs/SPEC.md)).

## Phase 0 — Développement local avec données mock

- **Stack** : Vite, React, TypeScript, Tailwind CSS, React Router
- **Connexion en dev** : page de login avec autocomplétion des utilisateurs (aucun mot de passe)
- **Données** : tout est en mock dans `src/mock/data.ts`

### Lancer en local

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:5173](http://localhost:5173). Se connecter en choisissant un utilisateur dans l'autocomplétion.

### Utilisateurs mock

| Rôle               | Email                    |
|--------------------|--------------------------|
| Administrateur général | admin@example.com        |
| Admin club         | club.admin@example.com   |
| Capitaine          | marie.dupont@example.com |
| Joueurs            | jean.martin@example.com, etc. |

### Authentification

L'application utilise une vraie authentification : code à usage unique par e-mail
(via Resend) et OAuth Google / Apple. La connexion « dev » (choix d'un utilisateur
sans mot de passe) reste disponible en développement (`npm run dev`) et en E2E.

La configuration des fournisseurs (clés Resend, identifiants OAuth) est décrite
dans [docs/AUTH_SETUP.md](docs/AUTH_SETUP.md). Sans ces valeurs, le code OTP est
journalisé et renvoyé comme `devCode` au lieu d'être envoyé par e-mail.

### Tests

- **Unit tests** (Vitest + React Testing Library) : `npm run test` (watch) ou `npm run test:run` (une fois). Couverture : `npm run test:coverage`.
- **E2E / UI** (Playwright) : une fois, installer les navigateurs : `npx playwright install chromium`. Puis `npm run test:e2e` (lance le serveur de dev si besoin). Si vous lancez les e2e depuis l’IDE, assurez-vous que le serveur tourne (`npm run dev`) ou utilisez `npm run test:e2e` en ligne de commande. Pour l’UI Playwright : `npm run test:e2e:ui`.

En CI, les tests unitaires et e2e s’exécutent sur chaque push/PR (voir `.github/workflows/test.yml`).
