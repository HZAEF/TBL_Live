#!/usr/bin/env node
/* eslint-disable no-console */
// ============================================================
// TBL Live v2.7.0 — Mode RÉSEAU LOCAL (« npm run lan »)
//
// Objectif : les étudiants qui n'ont pas (ou mal) d'internet se
// connectent au Wi-Fi de la salle et rejoignent la séance via
// L'ORDINATEUR DE L'ENSEIGNANT, qui fait relais vers la base de
// données en ligne (Neon). Les étudiants qui ont leur propre
// internet utilisent l'adresse habituelle (Vercel).
//
//   Internet ──┐                         ┌── Wi-Fi de la salle
//              │                         │
//        [ Base Neon ]◄── ordinateur ──► téléphones des étudiants
//                            enseignant      (http://192.168.x.x:3000)
//
// Même base de données → même séance, même code de 6 caractères :
// synchronisation EN TEMPS RÉEL entre les deux chemins, sans
// doublon (un étudiant qui change de chemin retrouve son compte
// avec son nom + son code personnel).
//
// Prérequis : application déjà installée et construite
// (npm install puis npm run build) et l'ordinateur enseignant
// connecté à internet (la connexion peut venir d'un partage de
// connexion 4G du téléphone : seuls les échanges de données
// passent, très légers).
//
// Port : 3000 par défaut, modifiable avec LAN_PORT=xxxx.
// ============================================================

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.LAN_PORT || 3000);
const SERVER = join(process.cwd(), ".next", "standalone", "server.js");

// ---------- 1. Le serveur autonome existe-t-il ? ----------
if (!existsSync(SERVER)) {
  console.error(`
❌ L'application n'est pas encore construite sur cet ordinateur.

   Ouvrez un terminal dans le dossier de l'application et lancez :
      npm install
      npm run build
   puis relancez :
      npm run lan

   (La construction ne se fait qu'une fois, ou après chaque mise à
   jour du code téléchargée depuis GitHub.)
`);
  process.exit(1);
}

// ---------- 2. Variables d'environnement (.env) ----------
// Le serveur autonome ne charge PAS le fichier .env tout seul :
// on lit DATABASE_URL (et les autres variables) et on les transmet.
function readDotEnv() {
  const env = {};
  for (const candidate of [".env", ".env.local"]) {
    const path = join(process.cwd(), candidate);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[m[1]] = value;
    }
  }
  return env;
}

const dotenv = readDotEnv();
const runtimeEnv = {
  ...dotenv,
  ...process.env, // variables déjà présentes prioritaires (LAN_PORT, etc.)
  NODE_ENV: "production",
  PORT: String(PORT),
  HOSTNAME: "0.0.0.0", // écoute sur toutes les interfaces (Wi-Fi inclus)
};

if (!runtimeEnv.DATABASE_URL) {
  console.error(`
❌ Base de données introuvable : la variable DATABASE_URL manque.

   Vérifiez le fichier .env à la racine de l'application (il
   contient l'adresse de votre base Neon, copiée depuis Vercel).
`);
  process.exit(1);
}

// ---------- 3. Adresses du réseau local ----------
function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      // Adresses privées (Wi-Fi / Ethernet de la salle) uniquement.
      if (
        ni.address.startsWith("192.168.") ||
        ni.address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ni.address)
      ) {
        out.push(ni.address);
      }
    }
  }
  return [...new Set(out)];
}

const addresses = lanAddresses();

console.log(`
┌─────────────────────────────────────────────────────────────┐
│  TBL Live — mode réseau local (v2.7.0)                      │
└─────────────────────────────────────────────────────────────┘

  ✔ Serveur démarré sur le port ${PORT} (écoute sur le réseau local)

  ▶ Enseignant (cet ordinateur) :
       http://localhost:${PORT}

  ▶ Étudiants SANS internet (connectés au Wi-Fi de la salle) :${
    addresses.length > 0
      ? `\n${addresses.map((a) => `       http://${a}:${PORT}`).join("\n")}`
      : "\n       (aucune adresse réseau local détectée — connectez\n        cet ordinateur au Wi-Fi de la salle et relancez)"
  }

  ▶ Étudiants AVEC leur propre internet :
       adresse habituelle de l'application (Vercel)

  Les deux chemins mènent à la MÊME séance (même code à 6
  caractères affiché dans le tableau de bord enseignant) : les
  résultats sont synchronisés en temps réel.

  💡 Au premier lancement, Windows peut demander d'autoriser
     Node.js dans le pare-feu : cliquez « Autoriser l'accès ».

  💡 Si la salle n'a AUCUN internet : partagez la connexion 4G de
     votre téléphone avec cet ordinateur — les échanges de données
     sont très légers, tous les étudiants passent alors par le
     réseau local. En fin de séance, « Configurations → Télécharger
     la séance » garde une copie complète réutilisable partout.

  Arrêter : Ctrl + C
`);

// ---------- 4. Lancement (le serveur tourne au premier plan) ----------
const child = spawn(process.execPath, [SERVER], {
  env: runtimeEnv,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
