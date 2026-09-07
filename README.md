# TBL Live — Application de Team-Based Learning

Application web gratuite qui déroule **toutes les étapes de la méthode TBL** (Team-Based Learning) avec vos étudiants, sur n'importe quel téléphone (Android, iPhone) ou ordinateur.

- ✅ **Test individuel (iRAT)** — chaque étudiant répond seul sur son téléphone
- ✅ **Test en équipe (tRAT)** — feedback immédiat façon « carte à gratter » (4 / 2 / 1 / 0 point)
- ✅ **Réclamations (appels)** — les équipes contestent avec justification ; passage automatique au feedback dès que toutes les équipes ont cliqué « Nous n'avons pas de réclamation »
- ✅ **Feedback** — statistiques en direct pour cibler votre mini-cours
- ✅ **Cas cliniques d'application** — chaque cas (énoncé + 3 à 5 QCU) s'affiche un par un ; les réponses sont enregistrées automatiquement au clic et **révélées automatiquement** dès que toutes les équipes ont répondu
- ✅ **Évaluation par les pairs** — chaque étudiant note ses coéquipiers
- ✅ **Résultats** — tableaux complets + **export Excel à 3 feuilles** (« Résultats », « Docimologie », « Questionnaire d'évaluation » — vrai fichier `.xlsx` généré sans dépendance) ; export CSV conservé en secours
- ✅ **Statistiques docimologiques** — onglet dédié du tableau de bord : indice de difficulté (p), discrimination (D), corrélation point-bisériale, fidélité (KR-20/alpha), SEM, analyse des distracteurs, IF-AT 4/2/1/0, effet équipe iRAT→tRAT, questions à revoir — avec **export CSV pour Excel** et glossaire pédagogique dépliable
- ✅ **9 langues** — sélecteur compact à drapeaux dans l'en-tête : français (défaut), anglais, espagnol, allemand, **italien, turc**, chinois, russe, arabe (droite-à-gauche) ; interface, messages d'erreur, questionnaire TBL-SAI et exports entièrement traduits, terminologie scientifique soignée ; le choix est mémorisé par appareil
- ✅ **Sécurité renforcée** — PIN enseignant à 6 caractères minimum, **stocké haché (bcrypt)** en base de données, avec verrouillage automatique (5 tentatives → 15 minutes de blocage), jeton d'accès transmis par en-tête chiffré, comparaisons en temps constant, en-têtes de sécurité HTTP (CSP), **code personnel choisi par chaque étudiant** (4 caractères minimum, obligatoire à la première connexion), jusqu'à **50 équipes** par séance
- ✅ **Gestion des séances** — suppression avec **confirmation** et **corbeille de 48 h** (restauration en un clic), **duplication** d'une séance (questions et cas cliniques copiés, sans les données des étudiants), **purge automatique** des données étudiantes après 4 mois (les QCM et cas cliniques sont conservés), **téléchargement/téléversement de séance** (export JSON complet, restauration sur n'importe quel appareil via l'onglet « Configurations »)
- ✅ **Mode réseau local** — `npm run lan` sur l'ordinateur enseignant : les étudiants sans internet se connectent au Wi-Fi de la salle via votre ordinateur (qui fait relais vers la base en ligne) ; même séance, même code, **synchronisation en temps réel** avec les étudiants connectés par leur propre internet ; un étudiant qui change de chemin retrouve son compte par nom + code personnel (aucun doublon)
- ✅ **Onglet « Configurations »** — réglages de la séance réunis : **titre modifiable** (action « Enregistrer le titre »), durée du iRAT, **téléchargement de la séance** (bouton déplacé ici depuis l'en-tête), **téléversement d'une séance déjà téléchargée** (restauration complète : nouvelle séance, identifiants recréés, étudiants retrouvés par nom + code personnel, nouveau PIN choisi), **exclusion d'un étudiant** (avec confirmation) et guide du mode réseau local
- ✅ Installable sur l'écran d'accueil des téléphones (PWA — service worker inclus, vraie installation autonome sur Android/Chrome et iOS), sans magasin d'applications
- ✅ **Protection anti-capture** — filigrane nominatif (nom · code de séance · horodatage rafraîchi toutes les 30 s) répété sur tout l'écran étudiant, flou automatique dès que l'onglet passe en arrière-plan (aperçu des applications récentes, enregistrement d'écran), anti-copie (sélection de texte, menu contextuel, impression bloquée) et **onglet « Signalements » dédié dans le tableau de bord enseignant** (juste après « Réclamations », avec pastille du nombre) : sortie de l'application pendant les tests (fiable sur tous les appareils) et suspicion de capture d'écran sur ordinateur (Impr. écran, Cmd+Shift+3/4/5, Win+Shift+S), **divisés par étudiant et par épreuve** (iRAT, tRAT, application/cas cliniques) — présentés comme des indices à interpréter, jamais des preuves ; en fin d'épreuve iRAT/tRAT, les étudiants voient une carte verte « Épreuve terminée » (plus de « Question suivante » sans objet)
- ✅ **Fin de séance repensée (TBL-SAI)** — l'étudiant choisit son **code personnel** (4 caractères minimum, chiffres ou lettres, obligatoire en saisissant son nom) qui lui permet de revenir dans sa séance sur tout appareil ; à la fin, il répond d'abord au **questionnaire TBL-SAI** (33 items de Mennenga, 3 sous-échelles, Likert 1-5, entièrement traduit dans les 9 langues) — verrou serveur : **tant qu'il n'a pas soumis, sa note finale /20 et son rang « Rang X / N » restent invisibles** (classement sportif, ex æquo partagés, jamais les résultats des autres) ; **plus aucun corrigé sur la page finale** (protection contre la divulgation hors classe — le corrigé reste visible pendant la phase de réclamations) ; l'enseignant adapte le questionnaire dans un **onglet « Questionnaire » dédié** (libellés modifiables, ajout/suppression d'items, réinitialisation, statistiques par sous-échelle et commentaires des étudiants) et un **bouton en bas de la page de création** permet de le personnaliser avant de créer la séance
- ✅ **Mises à jour sans perte** — le schéma de base s'applique en mode prudence : changements additifs automatiques, toute opération destructrice **arrête le déploiement** avec un message clair (jamais de `--accept-data-loss` silencieux) ; calculs docimologiques couverts par des tests automatiques (`npm test`)

---

## 1. Comment animer une séance TBL avec l'application

### Avant la séance (5 minutes)

1. Ouvrez l'application → **« Je suis enseignant »** → **« Créer une nouvelle séance »**.
2. Donnez un titre, choisissez un **code PIN** (au moins 6 caractères, chiffres et lettres — le bouton « Générer » 🎲 propose un code robuste ; notez-le : il permet de retrouver votre séance depuis n'importe quel appareil), le **nombre d'équipes (2 à 50)** et la durée du iRAT.
3. Saisissez vos questions. Bouton **« Charger l'exemple »** pour découvrir le fonctionnement avec des questions toutes prêtes.
   - Questions **iRAT / tRAT** : questions de vérification de la préparation (utilisées deux fois : en individuel puis en équipe).
   - **Cas cliniques d'application** : chaque cas a un titre, un énoncé (vignette du patient…) et 3 à 5 QCU. Ils sont affichés **un par un** aux équipes pendant la séance.
4. Cliquez sur **« Créer la séance »** : un **code à 6 caractères** s'affiche en grand.

### Pendant la séance (le déroulé guidé)

L'application vous guide étape par étape. Le bouton vert en bas passe d'une étape à la suivante.

| Étape | Ce que vous faites | Ce que font les étudiants |
|---|---|---|
| 1. Accueil | Affichez le code au tableau | Ils saisissent le code + leur **nom et prénom** ET **choisissent leur code personnel** (4 caractères minimum, chiffres ou lettres — obligatoire) qui leur permettra de retrouver leur séance sur un autre appareil |
| 2. iRAT | Surveillez la progression en direct | Chacun répond **seul** sur son téléphone |
| 3. tRAT | Surveillez les scores des équipes | **Un téléphone par équipe** : ils discutent puis valident (4 / 2 / 1 / 0 pt) |
| 4. Réclamations | Suivez le compteur « équipes ayant répondu » | Chaque équipe écrit ses contestations puis clique **« Nous n'avons pas de réclamation »** — quand toutes ont répondu, la phase suivante s'ouvre **automatiquement** |
| 5. Feedback | Mini-cours ciblé sur les questions en rouge | Ils voient leurs résultats et les bonnes réponses |
| 6. Application | Suivez la révélation automatique (ou forcez-la) | Les équipes travaillent les **cas cliniques un par un** ; chaque réponse est enregistrée **automatiquement** au clic ; les réponses de chaque question sont **révélées automatiquement** dès que toutes les équipes ont répondu |
| 7. Pairs | Vérifiez que tout le monde a soumis | Chacun note ses coéquipiers (1 à 5) |
| 8. Terminé | Exportez le CSV pour vos notes ; ouvrez l'onglet **Statistiques** pour l'analyse docimologique complète | Ils répondent au **questionnaire TBL-SAI** (obligatoire), puis voient **leur note finale sur 20 et leur rang** — sans les réponses correctes (protection anti-divulgation) |

### Après la séance
- Onglet **« Résultats »** → tableau **« Note finale sur 20 »** en haut de la page : chaque étudiant voit sa note globale combinant **iRAT 25 % · tRAT 25 % · application 35 % · évaluation par les pairs 15 %**. Chaque partie est d'abord ramenée sur 20 (iRAT : 1 point par bonne réponse ; tRAT : barème 4/2/1/0 ; application : bonnes réponses de l'équipe ; pairs : moyenne reçue sur 5). Si une partie n'existe pas (aucun exercice d'application, évaluation manquante…), son poids est automatiquement redistribué sur les autres.
- Les étudiants voient **uniquement leur note finale sur 20 et leur rang** (« Rang X / N ») sur l'écran de fin, **après** avoir répondu au questionnaire TBL-SAI — les réponses correctes n'y figurent plus (elles restent visibles pendant la phase de réclamations, sous votre conduite).
- Bouton **« Exporter tous les résultats (CSV) »** : un fichier Excel avec tout (détail question par question, notes /20 de chaque partie, note finale, réclamations, commentaires). Les scores s'écrivent « 10 sur 10 » (et non « 10/10 ») pour éviter qu'Excel les convertisse en dates (10-oct).
- Pour reprendre une séance : **« Reprendre une séance »** avec le code + votre PIN.

### Gérer le cycle de vie de vos séances

Depuis l'en-tête du tableau de bord, chaque séance dispose de deux nouveaux boutons :

- **« Supprimer »** 🗑️ — après une **confirmation obligatoire** (aucune suppression accidentelle possible), la séance part dans la **corbeille** :
  - vos étudiants n'y ont **plus accès immédiatement** (la séance disparaît aussi pour les nouveaux arrivants) ;
  - vous pouvez la **restaurer pendant 48 heures** (bouton « Restaurer la séance » — toutes les données reviennent intactes, y compris les réponses en cours) ;
  - pendant ce délai, vous gardez l'accès à vos résultats et à l'export CSV ;
  - après 48 h, la séance est **supprimée définitivement** (questions, réponses, notes). Vous pouvez aussi forcer la suppression définitive immédiatement avec une double confirmation.
- **« Dupliquer »** 📄 — crée une **copie prête à l'emploi** de la séance : mêmes questions iRAT/tRAT, mêmes cas cliniques, même nombre d'équipes et même durée — **sans les données des étudiants** (noms, réponses, notes, réclamations). La copie s'ouvre directement avec son **nouveau code** à donner aux étudiants et le **PIN** que vous avez choisi. Idéal pour réutiliser une séance d'une année sur l'autre.

**Nettoyage automatique (rétention de 4 mois)** : 4 mois après sa création, les **données étudiantes** d'une séance (noms, réponses, réclamations, évaluations par les pairs) sont **purgeées automatiquement** dès que vous rouvrez la séance — les QCM, cas cliniques, équipes et réglages sont **conservés** (un bandeau vous l'indique, avec le bouton « Dupliquer » pour réutiliser la séance). Vous n'avez donc rien à faire pour la confidentialité et la base de données reste légère au fil des années.

---

## 2. Comment les étudiants installent l'application sur leur téléphone

Aucun téléchargement, aucun compte :

- **Android (Chrome)** : ouvrez le lien → menu ⋮ → **« Installer l'application »** ou **« Ajouter à l'écran d'accueil »**.
- **iPhone (Safari)** : ouvrez le lien → bouton **Partager** (carré avec flèche) → **« Sur l'écran d'accueil »**.

L'icône apparaît alors comme une vraie application, en plein écran.

---

## 3. Héberger l'application GRATUITEMENT et définitivement

L'application fonctionne déjà dans l'aperçu. Pour en disposer **en permanence**, hébergez-la gratuitement sur **Vercel** (avec une base de données **Neon**, gratuite elle aussi). Comptez **30 à 40 minutes**, une seule fois. Aucune connaissance technique n'est nécessaire : suivez simplement les clics.

### Étape A — Créer un compte GitHub (2 min)
1. Allez sur **https://github.com/signup**.
2. Créez votre compte (email + mot de passe).

### Étape B — Déposer le code sur GitHub (5 min)
1. Connectez-vous, cliquez en haut à droite sur **« + »** → **« New repository »**.
2. Nommez-le par exemple `tbl-live`, laissez tout par défaut, cliquez **« Create repository »**.
3. Sur la page suivante, cliquez sur **« uploading an existing file »** (lien au-dessus de la zone vide).
4. Glissez-déposez le **contenu du dossier décompressé** `tbl-live-v2-1-1-nouveau-projet.zip` (tous les fichiers et dossiers extraits — le dossier `node_modules` n'y figure pas, tout est prêt à déposer).
5. Cliquez sur **« Commit changes »**.

### Étape C — Créer la base de données gratuite sur Neon (5 min)
1. Allez sur **https://neon.com** → **« Sign up »** (avec GitHub, c'est le plus simple).
2. Dans votre espace : **« Create project »** → nommez-le `tbl-live` → région au plus près de chez vous → **« Create »**.
3. Sur la page du projet, cherchez la **chaîne de connexion** (bouton **« Connect »** ou « Connection string »). Elle ressemble à :
   `postgresql://neondb_owner:xxxx@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
4. **Copiez-la** et gardez-la (elle servira à l'étape D).

### Étape D — Déployer sur Vercel (10 min)
1. Allez sur **https://vercel.com** → **« Sign Up »** → **« Continue with GitHub »**.
2. Cliquez sur **« Add New… »** → **« Project »**.
3. Votre dépôt `tbl-live` apparaît : cliquez **« Import »**.
4. **Avant de déployer**, ouvrez la section **« Environment Variables »** et ajoutez :
   - **Key** (nom) : `DATABASE_URL`
   - **Value** (valeur) : la chaîne de connexion Neon copiée à l'étape C.
   - Cliquez **« Add »**.
5. Cliquez sur **« Deploy »** et attendez 2-3 minutes.
6. 🎉 Votre application est en ligne ! Vercel vous donne une adresse du type
   `https://tbl-live-xxxx.vercel.app` — c'est **cette adresse** que vous donnerez à vos étudiants.

> ℹ️ Depuis la version 2.1.1, **plus aucune modification de fichier n'est nécessaire** : le fichier
> `prisma/schema.prisma` est déjà configuré pour PostgreSQL (Neon), et les tables de la base se
> créent toutes seules pendant le premier déploiement.

### Étape E — Vérifier (2 min)
1. Ouvrez l'adresse Vercel : l'application doit s'afficher.
2. Créez une séance de test, puis vérifiez dans Neon que les tables sont apparues.

---

## 4. Questions fréquentes

**Un étudiant a perdu sa connexion ou change de téléphone ?** Il rouvre l'application, saisit le même code, **le même nom** et son **code personnel** (celui qu'il a choisi à sa première connexion ; vous pouvez aussi le lui redonner depuis l'onglet Équipes) : il retrouve son équipe et toutes ses réponses. Sans ce code, personne ne peut prendre sa place — même en connaissant son nom.

**Un étudiant a oublié son code personnel ?** Ouvrez l'onglet **Équipes** du tableau de bord : le code de chaque étudiant apparaît en petit à côté de son nom.

**J'ai oublié mon PIN et je suis bloqué par le verrouillage ?** Le verrouillage dure 15 minutes maximum — patientez puis réessayez. Après 5 tentatives fausses, la connexion est temporairement bloquée : c'est une protection contre les essais répétés par des étudiants malins.

**J'ai fermé mon navigateur par erreur ?** « Je suis enseignant » → « Reprendre une séance » → code + PIN. Ou rouvrez simplement depuis le même appareil (« Mes séances »).

**J'ai supprimé une séance par erreur ?** Rien n'est perdu pendant 48 heures : rouvrez la séance (« Reprendre une séance » ou « Mes séances ») et cliquez sur **« Restaurer la séance »** dans le bandeau rouge — tout revient, y compris les réponses déjà données par les étudiants.

**Je veux refaire la même séance avec un autre groupe ?** Ouvrez la séance modèle → bouton **« Dupliquer »** → vous obtenez une copie identique (questions + cas cliniques) prête à l'inscription, sans les données des étudiants.

**Que deviennent les vieilles séances ?** Après 4 mois, les données étudiantes (noms, réponses, évaluations) sont purgées automatiquement à l'ouverture de la séance ; les QCM et cas cliniques restent disponibles et dupliquables. Les séances mises à la corbeille depuis plus de 48 h disparaissent définitivement, sans action de votre part.

**Puis-je modifier les questions pendant la séance ?** Oui (onglet « Questions »), mais évitez si des réponses existent déjà — les résultats pourraient devenir incohérents.

**Un étudiant arrive en retard pendant le iRAT ?** Il peut répondre tant que la phase est ouverte. Vous pouvez aussi revenir à une phase précédente (cliquez sur son numéro dans le fil des étapes en haut du tableau de bord).

**Combien d'étudiants ?** L'application est conçue pour des classes de 5 à 150 étudiants. Pendant les tests, le rafraîchissement se fait toutes les 2,5 s ; pendant les phases d'attente, le téléphone interroge le serveur deux fois moins souvent (la charge reste légère pour la base gratuite).

**Les données sont-elles privées ?** Les séances ne sont accessibles qu'avec le code à 6 caractères, et le tableau de bord enseignant est protégé par votre PIN **haché** (même l'administrateur de la base ne peut pas le lire ; verrouillage automatique après 5 tentatives incorrectes). Deux élèves homonymes ne peuvent pas « s'éjecter » : chacun garde son compte grâce au code personnel qu'il a choisi. N'utilisez pas de données sensibles dans les questions. Aucune donnée n'est partagée avec des tiers.

**Je veux une copie de sécurité de ma séance ?** Bouton **« Sauvegarder »** en haut du tableau de bord : un fichier JSON avec tout (questions, équipes, étudiants avec leurs codes personnels, réponses, réclamations, évaluations, questionnaire TBL-SAI et ses réponses) — sans les secrets (PIN, jetons). À télécharger avant chaque mise à jour de l'application.

---

Bonne séance TBL ! 🎓
