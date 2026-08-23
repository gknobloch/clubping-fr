import Svg, { Path, Rect } from 'react-native-svg'
import { colors } from '@/constants/colors'

/**
 * "Add to calendar" — a calendar with a plus in it (#426).
 *
 * Drawn from the same coordinates as the web's `CalendarPlusIcon`
 * (src/components/icons.tsx) so the two apps offer the same glyph for the same
 * gesture. Ionicons, which the rest of the app draws from, has no plus variant
 * — its `calendar-number-outline` shows a "31", which says *a date*, not *add
 * this one to your agenda*.
 */
export function CalendarPlusIcon({
  size = 22,
  color = colors.textSecondary,
}: {
  size?: number
  color?: string
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={5}
        width={18}
        height={16}
        rx={2}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 10h18M8 3v4M16 3v4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 13v5M9.5 15.5h5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
