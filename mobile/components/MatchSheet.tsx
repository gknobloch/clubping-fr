import { useMemo, useRef, useState } from 'react'
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
  PanResponder, type PanResponderInstance,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

export interface MatchSheetPlayer {
  firstName: string
  lastName: string
  license?: string
  points?: string
}

// Fixed row pitch — the drag maths convert finger travel into slot moves.
const ROW_H = 60

// Read-only "feuille de match" — club identity + the selected line-up with
// licences and phase points, to help fill the official sheet on site.
// Players can be reordered by dragging the handle (local only, not persisted).
export function MatchSheet({
  matchup,
  clubName,
  affiliationNumber,
  players,
  onClose,
}: {
  matchup: string
  clubName: string
  affiliationNumber: string
  players: MatchSheetPlayer[]
  onClose: () => void
}) {
  const byKey = useMemo(() => new Map(players.map((p, i) => [String(i), p])), [players])
  const [order, setOrder] = useState<string[]>(() => players.map((_, i) => String(i)))
  const [dragKey, setDragKey] = useState<string | null>(null)

  // Positional labels: A.. (from the start) or ..Z (ending at Z), e.g. ABCD /
  // WXYZ for 4, ABC / XYZ for 3. The letter follows the row position, so
  // reordering reassigns letters while A,B,C,D stay top-to-bottom.
  const n = players.length
  const firstSet = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i))
  const lastSet = Array.from({ length: n }, (_, i) => String.fromCharCode(90 - n + 1 + i))
  const [letterMode, setLetterMode] = useState<'first' | 'last'>('first')
  const activeSet = letterMode === 'first' ? firstSet : lastSet

  const orderRef = useRef(order)
  orderRef.current = order
  const baseOrderRef = useRef<string[]>([])
  const pansRef = useRef<Record<string, PanResponderInstance>>({})

  function getPan(key: string): PanResponderInstance {
    if (!pansRef.current[key]) {
      pansRef.current[key] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          baseOrderRef.current = orderRef.current.slice()
          setDragKey(key)
        },
        onPanResponderMove: (_e, g) => {
          const base = baseOrderRef.current
          const from = base.indexOf(key)
          const to = Math.max(0, Math.min(base.length - 1, from + Math.round(g.dy / ROW_H)))
          const next = base.filter((k) => k !== key)
          next.splice(to, 0, key)
          setOrder(next)
        },
        onPanResponderRelease: () => setDragKey(null),
        onPanResponderTerminate: () => setDragKey(null),
      })
    }
    return pansRef.current[key]
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.handleBar} />
          <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={dragKey === null}>
            <Text style={s.title}>Feuille de match</Text>
            <Text style={s.matchup}>{matchup}</Text>

            <View style={s.divider} />

            <Text style={s.sectionHeading}>Club</Text>
            <View style={s.kvRow}>
              <Text style={s.label}>Nom</Text>
              <Text style={s.value}>{clubName}</Text>
            </View>
            <View style={s.kvRow}>
              <Text style={s.label}>N° club</Text>
              <Text style={s.value}>{affiliationNumber}</Text>
            </View>

            <View style={s.divider} />

            <View style={s.joueursHead}>
              <Text style={[s.sectionHeading, { marginBottom: 0 }]}>Joueurs ({order.length})</Text>
              {n > 0 && (
                <View style={s.toggle}>
                  <TouchableOpacity
                    style={[s.toggleBtn, letterMode === 'first' && s.toggleBtnActive]}
                    onPress={() => setLetterMode('first')}
                  >
                    <Text style={[s.toggleTxt, letterMode === 'first' && s.toggleTxtActive]}>{firstSet.join('')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.toggleBtn, letterMode === 'last' && s.toggleBtnActive]}
                    onPress={() => setLetterMode('last')}
                  >
                    <Text style={[s.toggleTxt, letterMode === 'last' && s.toggleTxtActive]}>{lastSet.join('')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {order.map((k, i) => {
              const p = byKey.get(k)!
              const pan = getPan(k)
              return (
                <View key={k} style={[s.playerRow, dragKey === k && s.playerRowActive]}>
                  <View style={s.dragHandle} {...pan.panHandlers}>
                    <Ionicons name="reorder-three-outline" size={24} color={colors.textSecondary} />
                  </View>
                  <Text style={s.letter}>{activeSet[i]}</Text>
                  <View style={s.playerName}>
                    <Text style={s.firstName} numberOfLines={1}>{p.firstName}</Text>
                    <Text style={s.lastName} numberOfLines={1}>{p.lastName}</Text>
                  </View>
                  <View style={s.playerMeta}>
                    <Text style={s.license}>{p.license ?? '—'}</Text>
                    <Text style={s.points}>{p.points ?? '—'} pts</Text>
                  </View>
                </View>
              )
            })}
            {order.length === 0 && <Text style={s.empty}>Aucun joueur sélectionné.</Text>}
            {order.length > 0 && (
              <Text style={s.note}>L&apos;ordre est indicatif et n&apos;est pas enregistré.</Text>
            )}
          </ScrollView>

          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeTxt}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, maxHeight: '88%',
  },
  handleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12,
  },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary },
  matchup: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  sectionHeading: {
    fontSize: 12, fontFamily: fonts.bold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  joueursHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  toggle: {
    flexDirection: 'row', borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, overflow: 'hidden',
  },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  toggleBtnActive: { backgroundColor: colors.accent },
  toggleTxt: { fontSize: 13, fontFamily: fonts.bold, color: colors.textSecondary, letterSpacing: 1 },
  toggleTxtActive: { color: '#fff' },
  letter: { width: 22, fontSize: 16, fontFamily: fonts.bold, color: colors.accent, textAlign: 'center' },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  label: { fontSize: 15, color: colors.textSecondary },
  value: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: ROW_H,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  playerRowActive: { backgroundColor: colors.bg },
  dragHandle: { paddingHorizontal: 4, paddingVertical: 8 },
  playerName: { flex: 1 },
  firstName: { fontSize: 14, color: colors.textSecondary },
  lastName: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  playerMeta: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  license: { fontSize: 15, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  points: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary, minWidth: 64, textAlign: 'right' },
  empty: { fontSize: 15, color: colors.textSecondary, paddingTop: 8 },
  note: { fontSize: 12, fontStyle: 'italic', color: colors.textSecondary, marginTop: 12 },
  closeBtn: {
    backgroundColor: colors.bg, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20,
  },
  closeTxt: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
})
