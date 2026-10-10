import type { Federation } from '@/types'

/**
 * « FFTT | AGR » — the federation a page is about, before its phase (#645).
 * For a header's controls, where a dropdown would be the only one of its kind
 * (#432); dialogs use `FederationSelect`. Renders nothing when there is
 * nothing to choose: a club of one federation never sees it.
 */
export function FederationSwitch({
  options, value, onChange,
}: {
  options: ReadonlyArray<Pick<Federation, 'id' | 'shortName'>>
  value: string
  onChange: (federationId: string) => void
}) {
  if (options.length < 2) return null
  return (
    <div
      role="radiogroup"
      aria-label="Fédération"
      className="inline-flex h-11 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm md:h-9"
    >
      {options.map((f) => (
        <button
          key={f.id}
          type="button"
          role="radio"
          aria-checked={value === f.id}
          onClick={() => value !== f.id && onChange(f.id)}
          className={`min-w-11 px-3 font-display font-semibold ${
            value === f.id ? 'bg-accent-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {f.shortName}
        </button>
      ))}
    </div>
  )
}
