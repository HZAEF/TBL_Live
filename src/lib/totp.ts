import { createHmac, randomBytes } from 'node:crypto'

// ============================================================
// TBL Live v3.4.0 — AUTHENTIFICATION À DEUX FACTEURS (TOTP)
// Implémentation RFC 6238 SANS dépendance externe : HMAC-SHA-1,
// pas de 30 secondes, 6 chiffres, fenêtre de tolérance ±1 pas
// (l'horloge du téléphone peut dériver d'une trentaine de secondes).
//
// Compatible avec TOUTES les applications d'authentification :
// Google Authenticator, Microsoft Authenticator, Authy, FreeOTP,
// Aegis… (QR ou saisie manuelle du secret base32).
//
// ÉTAT : IMPLÉMENTÉE MAIS DÉSACTIVÉE — aucune 2FA n'est exigée
// tant que personne n'a terminé son inscription (secret null ou
// non confirmé). Voir /admin → onglet Sécurité et l'espace compte
// enseignant.
// ============================================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Génère un secret TOTP aléatoire (20 octets → 32 caractères
 * base32, saisie manuelle confortable). */
export function generateTotpSecret(): string {
  const bytes = randomBytes(20)
  return base32Encode(bytes)
}

/** Encodage base32 (RFC 4648, sans remplissage). */
export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

/** Décodage base32 (tolérant : espaces, minuscules, remplissage). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** Code TOTP pour un compteur de temps donné (HMAC-SHA-1, 6 chiffres). */
function totpAt(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  // Compteur 64 bits big-endian (Number sûr jusqu'à 2^53 — largement
  // au-delà de tout timestamp réel en pas de 30 s).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter % 0x100000000, 4)
  const digest = createHmac('sha1', secret).update(buf).digest()
  // Troncature dynamique (RFC 4226 §5.3).
  const offset = digest[digest.length - 1] & 0x0f
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

/**
 * Vérifie un code à 6 chiffres contre le secret (fenêtre ±1 pas de
 * 30 s : l'horloge du téléphone de l'utilisateur peut dériver).
 * Le code est comparé en temps constant (un code deviné au hasard
 * a 3/1 000 000 par essai, le verrouillage de compte fait le reste).
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false
  let secret: Buffer
  try {
    secret = base32Decode(secretBase32)
  } catch {
    return false
  }
  if (secret.length === 0) return false
  const counter = Math.floor(nowMs / 30_000)
  const a = totpAt(secret, counter - 1)
  const b = totpAt(secret, counter)
  const c = totpAt(secret, counter + 1)
  return timingSafeEq(a, code) || timingSafeEq(b, code) || timingSafeEq(c, code)
}

/** Comparaison en temps constant de deux chaînes de même longueur. */
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * URI otpauth:// à saisir (ou scanner via QR généré ailleurs) dans
 * l'application d'authentification. Format standard :
 * otpauth://totp/TBL%20Live:email?secret=…&issuer=TBL%20Live&digits=6&period=30
 */
export function totpUri(secretBase32: string, account: string): string {
  const issuer = 'TBL Live'
  return (
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
    `?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
  )
}
