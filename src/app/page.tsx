import { TblApp } from '@/components/tbl/tbl-app'
import { ErrorBoundary } from '@/components/tbl/error-boundary'

// v3.4.0 — filet de sécurité « écran blanc » (enquête sur les sorties
// involontaires signalées par quelques étudiants) : une erreur de rendu
// affiche un écran de récupération avec bouton « Reprendre la séance »
// au lieu d'un écran blanc figé. Les réponses sont enregistrées côté
// serveur à chaque clic : rien ne se perd.
export default function Home() {
  return (
    <ErrorBoundary>
      <TblApp />
    </ErrorBoundary>
  )
}
