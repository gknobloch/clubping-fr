import type { Federation } from '@/types'

/**
 * "Fédération" — the choice that comes before a division (#660). Renders
 * nothing when there is nothing to choose: a club of one federation never
 * sees it, and neither does a screen whose federations have not loaded.
 */
export function FederationSelect({
  id, options, value, onChange, wide = false,
}: {
  id: string
  options: ReadonlyArray<Pick<Federation, 'id' | 'shortName'>>
  value: string
  onChange: (federationId: string) => void
  /** Full width, as a dialog lays its fields out; a filter bar sizes it to its content. */
  wide?: boolean
}) {
  if (options.length < 2) return null
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">Fédération</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${wide ? 'w-full py-2' : 'py-1.5 text-sm'} min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20`}
      >
        {options.map((f) => (
          <option key={f.id} value={f.id}>{f.shortName}</option>
        ))}
      </select>
    </div>
  )
}
