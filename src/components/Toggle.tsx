import { TEXT_TARGET_CLASS } from './Button'

/**
 * A labelled on/off switch (#438).
 *
 * A native checkbox underneath, kept in the page rather than replaced by a
 * styled `<button>`: it keeps the label association, the keyboard behaviour and
 * the `checkbox` role, so the control is reachable by name from a screen reader
 * and from the tests. The switch is the `peer-checked:` track and knob drawn
 * beside it.
 *
 * The input is stretched over the whole label at `opacity-0` rather than made
 * `sr-only`. A 1px input tucked behind the track is the element a click has to
 * reach, and the track sits on top of it — which is exactly the "intercepts
 * pointer events" that Playwright refuses to click through.
 *
 * Use for a filter that is genuinely two-state and has a right answer by
 * default. For "show the archived ones too" additions to a list, the plain
 * checkbox already used on /equipes is still fine.
 */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className={`relative cursor-pointer select-none gap-2 ${TEXT_TARGET_CLASS}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="relative h-6 w-10 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-accent-600 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-400 peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
      />
      <span className="text-sm text-slate-600">{label}</span>
    </label>
  )
}
