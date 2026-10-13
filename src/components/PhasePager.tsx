import { PhaseSwitchButton } from '@/components/icons'
import { TOOLBAR_PILL_CLASS } from '@/components/Button'

/**
 * « ‹ Saison 2026/2027 Phase 1 › » — the phase pill of a header's toolbar,
 * beside `FederationSwitch` and the same height (#700). Équipes, Groupes,
 * Divisions and Journées each drew their own copy, and Divisions' had drifted
 * into a full-width card of another height.
 *
 * `onPrev`/`onNext` are left out when there is nowhere to go, as for
 * `Switcher` — its stacked phone form, which Journées keeps below md:.
 */
export function PhasePager({
  label,
  onPrev,
  onNext,
  className = 'flex',
}: {
  label: string
  onPrev?: () => void
  onNext?: () => void
  /** Display classes, for a page that only shows it from md: up. */
  className?: string
}) {
  return (
    <div className={`${className} items-center gap-1 px-1 ${TOOLBAR_PILL_CLASS}`}>
      <PhaseSwitchButton dir="prev" disabled={!onPrev} onClick={() => onPrev?.()} />
      <span className="whitespace-nowrap font-display text-sm font-semibold text-slate-800">{label}</span>
      <PhaseSwitchButton dir="next" disabled={!onNext} onClick={() => onNext?.()} />
    </div>
  )
}
