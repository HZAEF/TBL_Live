TBL LIVE
========

Suivez les étapes A à F du README.md inclus (comme pour votre première
installation) :

  Étape A — Compte GitHub (si vous en avez déjà un, passez à B).
  Étape B — Créez un NOUVEAU dépôt (repository) GitHub, par exemple
            « tbl-live-v2 », puis glissez-déposez le CONTENU de ce ZIP
            (tous les fichiers et dossiers extraits) via
            « Add file » → « Upload files » → « Commit changes ».
  Étape C — Créez un NOUVEAU projet sur https://neon.com (Sign up avec
            GitHub, « Create project », région proche de vous) et copiez
            la chaîne de connexion PostgreSQL.
  Étape D — Sur https://vercel.com (« Continue with GitHub ») :
            « Add New… » → « Project » → Importez le dépôt tbl-live-v2.
            AVANT de déployer, ajoutez la variable d'environnement :
              Key   : DATABASE_URL
              Value : la chaîne de connexion Neon copiée à l'étape C
            puis « Deploy » (2-3 minutes).
            ✔ Plus RIEN à modifier dans les fichiers : la base est déjà
            configurée pour Neon (PostgreSQL) et ses tables se créent
            toutes seules pendant le déploiement.
  Étape E — Ouvrez l'adresse https://tbl-live-v2-xxxx.vercel.app :
            c'est la NOUVELLE adresse à donner à vos étudiants.


POUR ESSAYER LOCALEMENT SUR VOTRE ORDINATEUR (optionnel, sans Internet)
------------------------------------------------------------------------
1. Installez Node.js (version LTS) depuis https://nodejs.org.
2. Décompressez ce ZIP dans un dossier, ouvrez un terminal dans ce dossier.
3. Dans prisma/schema.prisma, remplacez « postgresql » par « sqlite »
   (une seule ligne, le temps du test local — ce dossier ne servira qu'en
   local, il ne touche ni GitHub ni Neon).
4. Créez le fichier .env contenant la ligne :  DATABASE_URL="file:./dev.db"
   (sous PowerShell : Set-Content -Path .env -Value 'DATABASE_URL="file:./dev.db"')
5. Tapez :  npm install   puis :  npm run build
6. Lancez :  node .next/standalone/server.js
   puis ouvrez http://localhost:3000 dans votre navigateur.

Bonne séance TBL !
