/**
 * Strips the Android calendar permissions (READ_CALENDAR / WRITE_CALENDAR).
 *
 * expo-calendar's own config plugin declares both unconditionally, and it is
 * applied automatically for autolinked packages (SDK 55) — listing it in
 * app.json or not makes no difference. The app needs neither: its only call is
 * `createEventInCalendarAsync`, which on Android launches an
 * `Intent.ACTION_INSERT` and lets the Calendar app write the event under its
 * own identity (#418). Both are *dangerous* permissions, and the Play Store
 * lists them on the app's page.
 *
 * A plain filter rather than `android.blockedPermissions`: the permissions come
 * only from that static array — expo-calendar's own library manifest declares
 * none — so there is nothing to override with a `tools:node="remove"` entry,
 * and this leaves no trace in the manifest at all. The Android manifest mod
 * reads `android.permissions` when it runs, which is why listing this plugin
 * after "expo-calendar" in app.json is enough for it to win.
 *
 * The iOS usage string stays: `createEventInCalendarAsync` needs no permission
 * on iOS 17+, but below that it goes through `checkCalendarPermissions()`.
 */
const CALENDAR_PERMISSIONS = [
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
]

module.exports = function withoutAndroidCalendarPermissions(config) {
  if (Array.isArray(config.android?.permissions)) {
    config.android.permissions = config.android.permissions.filter(
      (permission) => !CALENDAR_PERMISSIONS.includes(permission),
    )
  }
  return config
}
