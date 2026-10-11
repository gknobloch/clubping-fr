// The one place `expo-document-picker` is imported (#681).
//
// It is a native module, added in 1.8.0. The app takes over-the-air updates
// for the binary it runs (`runtimeVersion: appVersion`), so this JavaScript
// can reach a phone whose binary was built without the module — and the
// module throws on import there, before anything is called. Required once,
// in a try, like `expoNotifications.ts`: a missing module is « update the
// app », never a crash of the screen that imports it.
import type * as DocumentPickerModule from 'expo-document-picker'

let DocumentPicker: typeof DocumentPickerModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DocumentPicker = require('expo-document-picker') as typeof DocumentPickerModule
} catch {
  DocumentPicker = null
}

export type PickedFile = { uri: string; name: string; mimeType?: string }

/**
 * Ask for one PDF. `null` when the member cancels; `'unavailable'` on a binary
 * without the module, which only a store update cures.
 */
export async function pickPdf(): Promise<PickedFile | null | 'unavailable'> {
  if (!DocumentPicker) return 'unavailable'
  try {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true })
    if (picked.canceled || !picked.assets?.[0]) return null
    const { uri, name, mimeType } = picked.assets[0]
    return { uri, name, mimeType: mimeType ?? undefined }
  } catch {
    return 'unavailable'
  }
}
