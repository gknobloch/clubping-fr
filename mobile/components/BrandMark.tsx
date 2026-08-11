import Svg, { Circle, ClipPath, Defs, G, Line } from 'react-native-svg'
import { colors } from '@/constants/colors'

// Club Ping brand mark — "face à face": two bats leaning towards each other
// with the ball between them, one red rubber and one black per the ITTF rule.
//
// A port of the web's src/components/BrandMark.tsx, drawn from the same
// coordinates so the two cannot drift apart visually. The web uses
// currentColor for the dark blade; here that is the `color` prop, since React
// Native has no inherited colour — white in the header, ink on a light card.
//
// Below 24px the handles close up on the blades; the app never draws it that
// small (the header uses 26).
export function BrandMark({
  size = 64,
  color = colors.textPrimary,
  ballColor = '#ffffff',
  label,
}: {
  size?: number
  /** The dark blade and its handle. The red side is the brand accent. */
  color?: string
  /**
   * The ball. White reads as the ball on a light surface; on a dark bar the
   * blade is white too, so the ball has to take the background's colour or it
   * vanishes into the blade and the mark becomes a blob.
   */
  ballColor?: string
  /** Announce the mark to a screen reader; decorative when absent. */
  label?: string
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      testID="brand-mark"
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
    >
      <Defs>
        <ClipPath id="brand-mark-clip">
          <Circle cx="24" cy="25" r="14" />
        </ClipPath>
      </Defs>
      <G translateY={0.7}>
        <G strokeWidth={6.5} strokeLinecap="round">
          <Line x1="20" y1="31.9" x2="10.5" y2="48.4" stroke={color} />
          <Line x1="44" y1="31.9" x2="53.5" y2="48.4" stroke={colors.accent} />
        </G>
        <Circle cx="24" cy="25" r="14" fill={color} />
        <Circle cx="40" cy="25" r="14" fill={colors.accent} />
        {/* The overlap, darkened: the red bat passes behind the dark one. */}
        <Circle cx="40" cy="25" r="14" fill="#8e2a2a" clipPath="url(#brand-mark-clip)" />
        <Circle cx="32" cy="25" r="5" fill={ballColor} />
      </G>
    </Svg>
  )
}
