import { db } from '@/lib/db'

// ============================================================
// TBL Live v3.4.0 — JOURNAL ADMINISTRATEUR (événements principaux)
//
// Complète le journal ENSEIGNANT (limité à une séance, table
// SessionEvent) par un journal GLOBAL : qui a créé/supprimé une
// séance, qui s'est connecté, qui a changé un mot de passe… Vu
// uniquement par l'administrateur (/admin → onglet Journal).
//
// PRINCIPES (repris du journal de séance) :
//  - OBSERVATEUR : l'écriture est BEST-EFFORT — un échec (base non
//    encore mise à jour, disque plein…) ne fait JAMAIS échouer
//    l'action de l'utilisateur ;
//  - AUCUN SECRET dans detail : jamais de mot de passe, de PIN, de
//    jeton, de code de reprise — uniquement libellés, titres de
//    séance, emails et codes de séance (déjà visibles de
//    l'administrateur) ;
//  - ROTATION : les ADMIN_KEEP derniers événements sont conservés
//    (les plus anciens supprimés par blocs de ADMIN_TRIM_EVERY) —
//    le journal ne fait pas grossir la base sans fin ;
//  - RÉSILIENT AU DÉCALAGE DE SCHÉMA : une instance en ligne dont
//    la base n'a pas la table AdminEvent (mise à jour de code sans
//    le schéma) fonctionne NORMALEMENT — le journal est simplement
//    vide jusqu'à l'application du schéma.
// ============================================================

const ADMIN_KEEP = 2000
const ADMIN_TRIM_EVERY = 100

export type AdminEventType =
  | 'session_created'
  | 'session_imported'
  | 'session_synced'
  | 'session_deleted'
  | 'session_restarted'
  | 'session_duplicated'
  | 'session_shared'
  | 'session_purged'
  | 'teacher_login'
  | 'teacher_locked'
  | 'teacher_password_changed'
  | 'teacher_password_reset'
  | 'teacher_account_created'
  | 'teacher_account_imported'
  | 'teacher_account_deleted'
  | 'admin_login'
  | 'admin_locked'
  | 'admin_password_changed'
  | 'admin_setup'
  | 'email_sent'
  | 'email_failed'
  | 'smtp_test'

const EVENT_TYPES: ReadonlySet<string> = new Set<AdminEventType>([
  'session_created',
  'session_imported',
  'session_synced',
  'session_deleted',
  'session_restarted',
  'session_duplicated',
  'session_shared',
  'session_purged',
  'teacher_login',
  'teacher_locked',
  'teacher_password_changed',
  'teacher_password_reset',
  'teacher_account_created',
  'teacher_account_imported',
  'teacher_account_deleted',
  'admin_login',
  'admin_locked',
  'admin_password_changed',
  'admin_setup',
  'email_sent',
  'email_failed',
  'smtp_test',
])

/** Compteur d'événements consignés depuis le démarrage du
 * processus (rotation déclenchée tous les ADMIN_TRIM_EVERY). */
let counter = 0

/**
 * Consigne un événement dans le journal administrateur.
 * Ne renvoie RIEN et ne lève JAMAIS : le journal ne peut pas
 * bloquer l'action qu'il observe.
 */
export async function logAdminEvent(
  type: AdminEventType,
  actor: string | null,
  detail?: string,
  sessionCode?: string | null
): Promise<void> {
  if (!EVENT_TYPES.has(type)) return
  try {
    await db.adminEvent.create({
      data: {
        type,
        actor: actor ? actor.slice(0, 160) : null,
        detail: detail ? detail.slice(0, 300) : null,
        sessionCode: sessionCode ? sessionCode.slice(0, 12) : null,
      },
    })
    counter += 1
    if (counter % ADMIN_TRIM_EVERY === 0) {
      try {
        // Rotation par RANG : les ADMIN_KEEP plus récents restent,
        // tout ce qui précède le plus ancien d'entre eux disparaît.
        const keep = await db.adminEvent.findMany({
          orderBy: { createdAt: 'desc' },
          take: ADMIN_KEEP,
          select: { createdAt: true },
        })
        if (keep.length === ADMIN_KEEP) {
          const cutoff = keep[keep.length - 1].createdAt
          await db.adminEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
        }
      } catch {
        // nettoyage best-effort
      }
    }
  } catch {
    // journal best-effort : table absente (schéma pas encore appliqué
    // sur CETTE instance) ou base indisponible → silence total
  }
}

export interface AdminEventDTO {
  id: string
  type: string
  actor: string | null
  detail: string | null
  sessionCode: string | null
  createdAt: string
}

/**
 * Derniers événements du journal (ordre décroissant).
 * Tolérante : base sans la table → liste vide.
 */
export async function listAdminEvents(limit = 200): Promise<AdminEventDTO[]> {
  try {
    const rows = await db.adminEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(500, limit)),
    })
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      actor: r.actor,
      detail: r.detail,
      sessionCode: r.sessionCode,
      createdAt: r.createdAt.toISOString(),
    }))
  } catch {
    return []
  }
}
