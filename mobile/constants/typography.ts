/**
 * Brand typography (#360).
 *
 * The web pairs DM Sans for text with Outfit for headings (see the `sans` and
 * `display` families in tailwind.config.js). Mobile shipped with neither, so
 * every screen fell back to the platform face — SF Pro on iOS, Roboto on
 * Android. Two platforms, two looks, neither of them the brand's.
 *
 * These are font *file* names, not weights, and that distinction is the whole
 * point: on Android a custom `fontFamily` combined with `fontWeight` does not
 * select the bold cut, it asks the system to synthesise one by smearing the
 * regular. Naming the cut is the only way to get real weights, so styles set
 * `fontFamily` and leave `fontWeight` alone.
 *
 * Every name here must also be registered by the `useFonts` call in
 * app/_layout.tsx — an unregistered family silently renders as the system face
 * on Android, which looks like nothing happened.
 */

/** Body text. Mirrors the web's `font-sans`. */
export const fonts = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
  extraBold: 'DMSans_800ExtraBold',
} as const

/**
 * Headings. Mirrors the web's `font-display`, which is used sparingly — screen
 * titles and section headings, never body copy. Keep it that way: Outfit's
 * wider counters read well large and muddy at 13px.
 */
export const displayFonts = {
  semiBold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
} as const
