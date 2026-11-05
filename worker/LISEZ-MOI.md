# Serveur de notifications Wirdî (wirdi-push)

Petit Worker Cloudflare qui envoie les notifications de l'appli : heures de prière, invocations du matin et du soir,
sourate Al-Kahf le vendredi, jours blancs. Il recalcule lui-même les horaires (même calcul que `app.js`, copié dans
`src/prayer.js`), donc les rappels continuent même si l'appli n'est pas ouverte pendant longtemps.

Gratuit dans les limites du plan Workers Free (tâche planifiée chaque minute + base D1).

## Mise en place (une seule fois)

Depuis ce dossier `worker/`, avec Node.js installé :

```sh
npx wrangler login                                  # ouvre le navigateur pour se connecter à Cloudflare
npx wrangler d1 create wirdi-push                   # affiche un database_id : le coller dans wrangler.toml
npx wrangler d1 execute wirdi-push --remote --file schema.sql
node vapid-keys.mjs                                 # affiche la clé publique et la clé privée
```

1. Collez la **clé publique** dans `wrangler.toml` (`VAPID_PUBLIC`).
2. Enregistrez la **clé privée** comme secret (ne la mettez jamais dans le dépôt) :
   `npx wrangler secret put VAPID_PRIVATE` puis collez-la.
3. Déployez : `npx wrangler deploy`. L'adresse affichée ressemble à `https://wirdi-push.<votre-sous-domaine>.workers.dev`.
4. Dans `app.js`, remplacez la valeur de `PUSH_API` par cette adresse, et ajoutez-la à `connect-src`
   dans la balise Content-Security-Policy de `index.html`.

Ne changez plus les clés VAPID ensuite : tous les abonnements existants seraient perdus.

## Tests

```sh
node test/prayer.test.mjs     # les horaires du serveur = ceux de l'appli
node test/schedule.test.mjs   # enchaînement des rappels sur une semaine, jours blancs sur un an
```

## Appli Android (Play Store)

Dans PWABuilder, au moment de générer l'AAB, laissez cochée l'option **Notification delegation** (« Enable notifications »)
pour que les notifications web s'affichent comme celles de l'appli. Pensez aussi à mettre à jour la section
« Sécurité des données » de la fiche Play Store : position approximative collectée, uniquement si l'utilisateur active
les notifications, pour le fonctionnement de l'appli.

## iPhone

Les notifications marchent à partir d'iOS 16.4, uniquement quand Wirdî est ajoutée à l'écran d'accueil.
