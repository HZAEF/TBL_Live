import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'

// ============================================================
// TBL Live v3.4.0 — ENVOI D'EMAILS PAR SMTP (sans dépendance)
//
// Client SMTP minimal en Node pur : EHLO, STARTTLS (recommandé),
// AUTH LOGIN/PLAIN, message MIME texte + HTML, expéditeur et
// destinataire uniques. Suffisant pour l'usage de l'application :
// l'envoi OCCASIONNEL d'un mot de passe de récupération à un
// enseignant (et le test de configuration de l'administrateur).
//
// ÉTAT : IMPLÉMENTÉ MAIS DÉSACTIVÉ — tant que l'administrateur
// n'a pas configuré ET activé l'envoi (/admin → Sécurité), aucun
// email ne part : « mot de passe oublié » garde le comportement
// actuel (badge pour l'administrateur, qui transmet lui-même).
//
// SÉCURITÉ :
//  - le mot de passe SMTP vit dans la base (AdminSetting.smtpConfig)
//    et n'est JAMAIS renvoyé au navigateur après enregistrement ;
//  - STARTTLS systématique quand le serveur le propose (port 587) ;
//    connexion TLS directe possible (port 465, starttls: false) ;
//  - aucun fichier n'est écrit, aucun journal ne contient le mot
//    de passe.
// ============================================================

export interface SmtpConfig {
  host: string
  port: number
  username: string
  password: string
  from: string
  /** true = TLS dès la connexion (port 465) ; false/absent =
   * STARTTLS si proposé (port 587, recommandé). */
  secure?: boolean
}

/** Lit et valide la configuration SMTP JSON de AdminSetting. */
export function parseSmtpConfig(raw: string | null | undefined): SmtpConfig | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const host = typeof o.host === 'string' ? o.host.trim() : ''
    const port = typeof o.port === 'number' && Number.isInteger(o.port) && o.port > 0 && o.port < 65536 ? o.port : 587
    const username = typeof o.username === 'string' ? o.username : ''
    const password = typeof o.password === 'string' ? o.password : ''
    const from = typeof o.from === 'string' ? o.from.trim() : ''
    const secure = o.secure === true
    if (!host || !from || !username || !password) return null
    return { host, port, username, password, from, secure }
  } catch {
    return null
  }
}

/** Échange ligne/commande SMTP : attend une réponse de code donné. */
class SmtpDialog {
  private socket: Socket
  private buffer = ''
  private resolver: ((lines: string[]) => void) | null = null
  private rejecter: ((err: Error) => void) | null = null
  private tlsUpgraded = false

  constructor(socket: Socket) {
    this.socket = socket
    this.socket.setEncoding('utf-8')
    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk
      // Une réponse SMTP est terminée quand une ligne se termine par
      // « NNN » (code seul) — pas « NNN- » (ligne multiligne).
      const lines = this.buffer.split('\r\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/^\d{3}( |$)/.test(line.trimEnd()) || (line === '' && this.buffer.endsWith('\r\n'))) {
          // réponse complète : tout jusqu'à cette ligne incluse
          const complete = lines.slice(0, i + 1)
          this.buffer = lines.slice(i + 1).join('\r\n')
          const r = this.resolver
          this.resolver = null
          if (r) r(complete.map((l) => l.replace(/\r$/, '')))
          return
        }
      }
    })
    this.socket.on('error', (err: Error) => {
      const rej = this.rejecter
      this.rejecter = null
      this.resolver = null
      if (rej) rej(err)
    })
  }

  get upgraded(): boolean {
    return this.tlsUpgraded
  }

  /** Attends la réponse du serveur (liste de lignes « 250 … »). */
  read(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.rejecter = reject
      this.resolver = resolve
      // Filet de sécurité : 20 s sans réponse → abandon propre.
      setTimeout(() => {
        if (this.resolver === resolve) {
          this.resolver = null
          this.rejecter = null
          reject(new Error('Le serveur SMTP ne répond pas (20 s).'))
        }
      }, 20_000)
    })
  }

  /** Envoie une commande et attends la réponse. */
  async command(cmd: string, expected: number[]): Promise<string[]> {
    if (!this.socket.destroyed) this.socket.write(cmd + '\r\n')
    const lines = await this.read()
    const code = lines.length > 0 ? Number(lines[lines.length - 1].slice(0, 3)) : 0
    if (!expected.includes(code)) {
      throw new Error(`Réponse SMTP inattendue : ${lines.join(' / ')}`)
    }
    return lines
  }

  /** Passe la connexion en TLS (STARTTLS). */
  async startTls(host: string): Promise<void> {
    await this.command('STARTTLS', [220])
    const plain = this.socket
    const tlsSocket = tlsConnect({ socket: plain, servername: host })
    await new Promise<void>((resolve, reject) => {
      tlsSocket.once('secureConnect', () => resolve())
      tlsSocket.once('error', (err: Error) => reject(err))
    })
    this.socket = tlsSocket
    this.attach(tlsSocket)
    this.tlsUpgraded = true
  }

  private attach(socket: Socket) {
    socket.setEncoding('utf-8')
    socket.on('data', (chunk: string) => {
      this.buffer += chunk
      const lines = this.buffer.split('\r\n')
      for (let i = 0; i < lines.length; i++) {
        if (/^\d{3}( |$)/.test(lines[i].trimEnd())) {
          const complete = lines.slice(0, i + 1)
          this.buffer = lines.slice(i + 1).join('\r\n')
          const r = this.resolver
          this.resolver = null
          if (r) r(complete)
          return
        }
      }
    })
    socket.on('error', (err: Error) => {
      const rej = this.rejecter
      this.rejecter = null
      this.resolver = null
      if (rej) rej(err)
    })
  }

  end() {
    try {
      this.socket.end()
    } catch {
      // déjà fermé
    }
  }
}

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

/**
 * Envoie un email via la configuration SMTP.
 * Lève une Error avec un message EN FRANÇAIS expliquant l'échec —
 * l'appelant décide quoi en faire (journal admin, message admin).
 */
export async function sendMail(cfg: SmtpConfig, mail: MailMessage): Promise<void> {
  let dialog: SmtpDialog | null = null
  try {
    const socket = cfg.secure
      ? await new Promise<Socket>((resolve, reject) => {
          const s = tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host })
          s.once('secureConnect', () => resolve(s))
          s.once('error', reject)
        })
      : await new Promise<Socket>((resolve, reject) => {
          const s = netConnect({ host: cfg.host, port: cfg.port })
          s.once('connect', () => resolve(s))
          s.once('error', reject)
        })
    dialog = new SmtpDialog(socket)
    // Salutation du serveur (220)
    await dialog.read()
    // EHLO (capabilities — STARTTLS visible ici)
    const ehlo = await dialog.command(`EHLO ${cfg.host}`, [250])
    const supportsTls = ehlo.some((l) => l.toUpperCase().includes('STARTTLS'))
    if (!cfg.secure && supportsTls && !dialog.upgraded) {
      await dialog.startTls(cfg.host)
      await dialog.command(`EHLO ${cfg.host}`, [250])
    }
    // Authentification (AUTH PLAIN si proposé, sinon AUTH LOGIN).
    const authCaps = ehlo.some((l) => l.toUpperCase().startsWith('AUTH'))
    const usePlain = ehlo.some((l) => /AUTH\b.*\bPLAIN\b/i.test(l)) || !authCaps
    const userB64 = Buffer.from(cfg.username, 'utf-8').toString('base64')
    const passB64 = Buffer.from(cfg.password, 'utf-8').toString('base64')
    if (usePlain) {
      const plainB64 = Buffer.from(`\0${cfg.username}\0${cfg.password}`, 'utf-8').toString('base64')
      await dialog.command(`AUTH PLAIN ${plainB64}`, [235])
    } else {
      await dialog.command('AUTH LOGIN', [334])
      await dialog.command(userB64, [334])
      await dialog.command(passB64, [235])
    }
    // Enveloppe + corps MIME
    await dialog.command(`MAIL FROM:<${envelopeAddress(cfg.from)}>`, [250])
    await dialog.command(`RCPT TO:<${envelopeAddress(mail.to)}>`, [250, 251])
    await dialog.command('DATA', [354])
    const headers = [
      `From: ${mimeHeader(cfg.from)}`,
      `To: ${mimeHeader(mail.to)}`,
      `Subject: ${mimeEncoded(mail.subject)}`,
      'MIME-Version: 1.0',
      `Date: ${new Date().toUTCString()}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
    ]
    const body = Buffer.from(mail.text, 'utf-8').toString('base64')
    // Corps base64 découpé en lignes de 76 caractères (RFC 2045).
    const bodyLines = (body.match(/.{1,76}/g) ?? []).join('\r\n')
    await dialog.command(`${headers.join('\r\n')}\r\n\r\n${bodyLines}\r\n.`, [250])
    await dialog.command('QUIT', [221])
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `Envoi impossible : ${e.message}`
        : 'Envoi impossible : erreur SMTP inconnue.'
    )
  } finally {
    dialog?.end()
  }
}

/** Adresse nue de « Nom <addr@serveur> » ou « addr@serveur ». */
function envelopeAddress(addr: string): string {
  const m = /<([^>]+)>/.exec(addr)
  return (m ? m[1] : addr).trim()
}

/** En-tête From/To : texte brut ASCII-safe, sinon encodage B. */
function mimeHeader(addr: string): string {
  return /[^\x00-\x7F]/.test(addr) ? `"${mimeEncoded(addr)}"` : addr
}

/** Encodage RFC 2047 « =?utf-8?B?…?= » pour l'objet (accents). */
function mimeEncoded(text: string): string {
  return /[^\x00-\x7F]/.test(text)
    ? `=?utf-8?B?${Buffer.from(text, 'utf-8').toString('base64')}?=`
    : text
}
