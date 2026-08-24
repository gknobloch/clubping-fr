import { PhaseSwitchButton } from '@/components/icons'

/**
 * Stacked `< titre >` pager (#432).
 *
 * The phone form of the Journées phase and journée switchers, and the same
 * control the mobile app draws (`mobile/components/Switcher.tsx`) — one label
 * centred between two chevrons, full width, `large` for the one that carries
 * the screen.
 *
 * Stacking them is what makes them fit: side by side, two 44px chevrons plus
 * "2025/2026 Phase 1" and a journée control overflowed a 375px screen, which
 * is why the phase used to be a native `<select>` here.
 *
 * `onPrev`/`onNext` are left out, not disabled, when there is nowhere to go —
 * the same contract as the mobile component.
 */
export function Switcher({
  title,
  subtitle,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  large,
}: {
  title: string
  subtitle?: string
  prevLabel?: string
  nextLabel?: string
  onPrev?: () => void
  onNext?: () => void
  large?: boolean
}) {
  return (
    <div
      className={`flex w-full items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-1 ${
        large ? 'py-1.5' : ''
      }`}
    >
      <PhaseSwitchButton
        dir="prev"
        disabled={!onPrev}
        onClick={() => onPrev?.()}
        prevLabel={prevLabel ?? 'Phase précédente'}
      />
      <span className="min-w-0 flex-1 text-center">
        <span
          className={
            large
              ? 'block font-display text-base font-semibold text-slate-800'
              : 'block truncate font-display text-sm font-semibold text-slate-800'
          }
        >
          {title}
        </span>
        {subtitle && <span className="block truncate text-xs text-slate-500">{subtitle}</span>}
      </span>
      <PhaseSwitchButton
        dir="next"
        disabled={!onNext}
        onClick={() => onNext?.()}
        nextLabel={nextLabel ?? 'Phase suivante'}
      />
    </div>
  )
}
