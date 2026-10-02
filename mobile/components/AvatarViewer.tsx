import { Modal, Pressable, Image, StyleSheet, useWindowDimensions } from 'react-native'
import { avatarImageSource } from '@/utils/avatarSource'
import { MODAL_ORIENTATIONS } from '@/components/Sheet'

// Full-screen lightbox for a player's avatar. Tapping the dimmed backdrop (or
// the system back gesture) dismisses it. Reuses Avatar's authenticated,
// cache-busting image source so the URI/header logic isn't duplicated.
export function AvatarViewer({
  playerId,
  avatarUpdatedAt,
  onClose,
}: {
  playerId: string
  avatarUpdatedAt: string
  onClose: () => void
}) {
  const { width } = useWindowDimensions()
  // Cap at the stored thumbnail resolution (256px) so it stays sharp.
  const size = Math.min(width - 64, 280)

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={MODAL_ORIENTATIONS}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Image
          source={avatarImageSource(playerId, avatarUpdatedAt)}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
