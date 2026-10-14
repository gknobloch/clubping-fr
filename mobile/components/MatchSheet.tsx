import { useMemo, useRef, useState } from 'react'
import { formatRankingShort } from '@shared/lib/ranking'
import {
  placeBestRanked, reservedLine, reservedLineNote, sheetLetters, sheetOrderRefusal, type SheetSide,
} from '@shared/lib/matchSheet'
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
  PanResponder, type PanResponderInstance,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Sheet } from '@/components/Sheet'
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
// Letters and placement are the federation's (`@shared/lib/matchSheet`, #650):
// at the AGR, four a side, the best ranked holds A or V, and a drag that
// would put anyone else there springs back, saying why.
export function MatchSheet({
  matchup,
  clubName,
  affiliationNumber,
  players,
  isHome = true,
  federationId,
  onClose,
}: {
  matchup: string
  clubName: string
  affiliationNumber: string
  players: MatchSheetPlayer[]
  /** Which side's letters the sheet opens on. */
  isHome?: boolean
  /** Whose ranking the values are: « 1731 pts », or « 45 » at the AGR (#646, #735). */
  federationId?: string
  onClose: () => void
}) {
  const byKey = useMemo(() => new Map(players.map((p, i) => [String(i), p])), [players])
  const keyed = useMemo(() => players.map((p, i) => ({ key: String(i), points: p.points })), [players])
  const placed = (keys: string[], side: SheetSide) =>
    placeBestRanked(keys.map((k) => keyed[Number(k)]), federationId, side).map((p) => p.key)
  const refusalOf = (keys: string[], side: SheetSide) =>
    sheetOrderRefusal(keys.map((k) => keyed[Number(k)]), federationId, side)
  const [side, setSide] = useState<SheetSide>(isHome ? 'home' : 'away')
  const [order, setOrder] = useState<string[]>(() => placed(players.map((_, i) => String(i)), isHome ? 'home' : 'away'))
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  // The letter follows the row position, so reordering reassigns letters
  // while the set stays top-to-bottom.
  const n = players.length
  const homeSet = sheetLetters(federationId, n, 'home')
  const awaySet = sheetLetters(federationId, n, 'away')
  const activeSet = side === 'home' ? homeSet : awaySet
  const reserved = reservedLine(federationId, n, side)
  const note = reservedLineNote(federationId, n)
  const sideRef = useRef(side)
  sideRef.current = side
  const changeSide = (next: SheetSide) => {
    setSide(next)
    setOrder((prev) => placed(prev, next))
    setRefusal(null)
  }

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
        // A drop the federation refuses goes back where it started.
        onPanResponderRelease: () => {
          const why = refusalOf(orderRef.current, sideRef.current)
          setRefusal(why)
          if (why) setOrder(baseOrderRef.current)
          setDragKey(null)
        },
        onPanResponderTerminate: () => {
          setOrder(baseOrderRef.current)
          setDragKey(null)
        },
      })
    }
    return pansRef.current[key]
  }

  return (
    <Sheet onClose={onClose} maxHeight="88%" testID="match-sheet">
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
                style={[s.toggleBtn, side === 'home' && s.toggleBtnActive]}
                onPress={() => changeSide('home')}
              >
                <Text style={[s.toggleTxt, side === 'home' && s.toggleTxtActive]}>{homeSet.join('')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, side === 'away' && s.toggleBtnActive]}
                onPress={() => changeSide('away')}
              >
                <Text style={[s.toggleTxt, side === 'away' && s.toggleTxtActive]}>{awaySet.join('')}</Text>
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
              <Text style={[s.letter, i === reserved && s.letterReserved]}>{activeSet[i]}</Text>
              <View style={s.playerName}>
                <Text style={s.firstName} numberOfLines={1}>{p.firstName}</Text>
                <Text style={s.lastName} numberOfLines={1}>{p.lastName}</Text>
              </View>
              <View style={s.playerMeta}>
                <Text style={s.license}>{p.license ?? '—'}</Text>
                <Text style={s.points}>{formatRankingShort(p.points, federationId)}</Text>
              </View>
            </View>
          )
        })}
        {order.length === 0 && <Text style={s.empty}>Aucun joueur sélectionné.</Text>}
        {refusal && <Text style={s.refusal} accessibilityRole="alert">{refusal}</Text>}
        {note && order.length > 0 && <Text style={s.rule}>{note}</Text>}
        {order.length > 0 && (
          <Text style={s.note}>L&apos;ordre est indicatif et n&apos;est pas enregistré.</Text>
        )}
      </ScrollView>

      <TouchableOpacity testID="match-sheet-close" style={s.closeBtn} onPress={onClose}>
        <Text style={s.closeTxt}>Fermer</Text>
      </TouchableOpacity>
    </Sheet>
  )
}

const s = StyleSheet.create({
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
  letterReserved: { backgroundColor: colors.bg, borderRadius: 4, overflow: 'hidden' },
  refusal: { fontSize: 14, color: colors.danger, marginTop: 12 },
  rule: { fontSize: 13, color: colors.textSecondary, marginTop: 12 },
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
