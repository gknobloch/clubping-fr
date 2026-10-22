/**
 * Where the native app is downloaded from, for a page of the web app (#773).
 *
 * The web's own addresses: `https://` on both, so a desktop browser lands on
 * the listing page and a phone hands the link to its store. The app's update
 * wall (`mobile/utils/clientVersion.ts`) opens the same two listings, the App
 * Store by its `itms-apps://` scheme, which only a phone understands.
 */
export const APP_STORE_URL = 'https://apps.apple.com/fr/app/id6799859449'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=fr.clubping.app'
