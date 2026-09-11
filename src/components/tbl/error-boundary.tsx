'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

// ============================================================
// TBL Live v3.4.0 — FILET DE SÉCURITÉ « écran blanc ».
//
// CONTEXTE (enquête « sorties involontaires », rares) : sans filet,
// une exception levée pendant un RENDU React démonte TOUT l'arbre →
// écran blanc figé → l'étudiant ferme l'application et se réinscrit.
// iOS peut aussi tuer l'application sous pression mémoire : au
// retour, l'écran d'accueil + la REPRISE AUTOMATIQUE (jeton local)
// remettent l'étudiant dans sa séance en quelques secondes.
//
// CE COMPOSANT : intercepte toute erreur de rendu et affiche un
// message clair + un bouton « Reprendre la séance » (rechargement —
// la reprise automatique suit son cours : AUCUNE réponse n'est
// perdue, elles sont enregistrées au serveur à chaque clic).
// L'erreur est loggée en console pour le diagnostic (enseignant ou
// support : la reproduire avec le message exact accélère la
// correction). C'est un filet, pas une excuse : les erreurs
// interceptées restent des bugs à corriger.
// ============================================================

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Diagnostic : complet en console, jamais envoyé au serveur
    // (aucune donnée étudiante ne quitte l'appareil par ce chemin).
    console.error('[TBL Live] Erreur d’affichage interceptée :', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border-2 border-amber-300 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-stone-900">
              L’application a rencontré un problème d’affichage
            </h1>
            <p className="text-sm leading-relaxed text-stone-600">
              Rien n’est perdu : vos réponses déjà envoyées sont enregistrées.
              Recliquez sur le bouton ci-dessous — vous reviendrez dans votre séance
              automatiquement. Si le problème se répète, prévenez votre professeur.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-bold text-white transition-colors hover:bg-emerald-700"
            >
              <RotateCw className="h-5 w-5" />
              Reprendre la séance
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
