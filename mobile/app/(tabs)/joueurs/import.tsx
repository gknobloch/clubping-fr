import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Screen, contentWidth } from '@/components/Screen'
import { PagerDots, usePagerSwipe } from '@/components/Pager'
import { colors } from '@/constants/colors'
import { fonts, displayFonts } from '@/constants/typography'
import { canManageClub } from '@/utils/roles'
import { sortByName } from '@shared/lib/sortByName'
import {
  buildImportRows,
  defaultImportSelection,
  fetchClubLicencesFromBrowser,
  fieldKey,
  playerImportWrites,
  playersMissingFromFftt,
  sameClubNumber,
  writableFields,
  type PlayerImportRow,
  type PlayerSyncField,
} from '@shared/lib/ffttPlayers'
import type { Player } from '@shared/types'

// ---------------------------------------------------------------------------
// Importer les licenciés FFTT, au doigt (#555)
//
// The web has had this since #384, and #381 then hid it below `md:` — the
// review there is a table of every licence against every field, and 375px does
// not hold one. That was the right call for the table and the wrong one for
// the feature: a club officer updating a roster is standing in a gymnasium,
// not sitting at a desk.
//
// So the review is turned on its side. One licensee per card, swiped through
// like the match screen's neighbours (#552) — the same `Pager`, because this
// app has one carousel and this is it. What was a row of the table is now the
// card's own list of fields, each one still tickable on its own, which is the
// part of #384 worth keeping at any width: FFTT exports names unaccented and
// sometimes stale, and "take all of it" is not an answer a club can give.
//
// Nothing about *what* an import writes lives here: `playerImportWrites` is
// the one derivation, shared with the web, so the two screens cannot review
// the same listing and write different things.
// ---------------------------------------------------------------------------

type Status =
  | { kind: 'loading' }
  /** FFTT unreachable — offline, or their proxy down. */
  | { kind: 'error' }
  /** Reached, and it lists nobody for this club. */
  | { kind: 'empty' }
  | { kind: 'review' }
  | { kind: 'importing' }
  | { kind: 'done'; created: number; updated: number }

export default function ImportPlayersScreen() {
  const { user } = useAuth()
  const {
    clubs, phases, players, playerPhasePoints, playerSeasonCategories,
    setClubSeasonLicences, applyPlayerImport,
  } = useAppData()
  const router = useRouter()

  const club = clubs.find((c) => c.id === user?.clubId)
  const mayImport = !!user && !!club && canManageClub(user, club.id) && !!club.affiliationNumber

  // The phase the points land on, stated rather than chosen. The web offers a
  // picker; on a phone it would be one more decision in front of the thing the
  // member came to do, and the answer is the season being played every time
  // but the handful of days around a phase change. It is named on screen, and
  // whoever needs the other one has the web.
  const phase = useMemo(() => {
    const ordered = [...phases].sort((a, b) => a.displayName.localeCompare(b.displayName))
    return phases.find((p) => p.status === 'active') ?? ordered[ordered.length - 1]
  }, [phases])

  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  /** The licensees with something to write — the deck being reviewed. */
  const [deck, setDeck] = useState<PlayerImportRow[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** Licensees FFTT lists that we already hold, field for field. */
  const [upToDate, setUpToDate] = useState(0)
  const [missing, setMissing] = useState<Player[]>([])

  const clubPlayers = useMemo(
    () => players.filter((p) => p.clubId === club?.id && p.status === 'active'),
    [players, club?.id],
  )

  const load = useCallback(async () => {
    if (!club?.affiliationNumber) return
    setStatus({ kind: 'loading' })
    const licences = await fetchClubLicencesFromBrowser(club.affiliationNumber)
    if (licences === null) return setStatus({ kind: 'error' })
    // The endpoint is scoped by club number, but that is FFTT's word for it and
    // not ours — drop anything that came back for another club.
    const ours = licences.filter((l) => sameClubNumber(l.clubNumber, club.affiliationNumber))
    if (ours.length === 0) return setStatus({ kind: 'empty' })

    const rows = buildImportRows(
      ours, players, playerPhasePoints, phase?.id ?? '', [],
      playerSeasonCategories, phase?.seasonId,
    )
    // Only the licensees with something to write go in the deck. On the web the
    // unchanged ones are rows of a table one glance takes in; here each is a
    // card to swipe past, and a club whose roster is already right would be
    // eighty swipes of "rien à écrire". The count says they were seen.
    const reviewable = rows.filter((r) => writableFields(r.fields).length > 0)
    setDeck(reviewable)
    setUpToDate(rows.length - reviewable.length)
    setIndex(0)
    setSelected(defaultImportSelection(reviewable))
    setMissing(playersMissingFromFftt(ours, clubPlayers))
    setStatus({ kind: 'review' })

    // Who holds a validated licence this season is a fact about this listing,
    // not about which fields the member then ticks — so it is recorded now, and
    // for the whole club at once, since only a club-wide fetch can say who is
    // absent from it (#488). Best-effort: it is a by-product of the fetch, and
    // failing to record it must not stand between the member and the review.
    if (phase?.seasonId) {
      const listed = new Set(ours.map((l) => l.licence.trim()))
      setClubSeasonLicences(
        club.id,
        phase.seasonId,
        clubPlayers.filter((p) => listed.has((p.licenseNumber ?? '').trim())).map((p) => p.id),
      ).catch(() => {})
    }
    // `players` and the rest are read at call time, not depended on: a refetch
    // landing mid-review must not rebuild the deck under the member's finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, club?.affiliationNumber, phase?.id, phase?.seasonId])

  useEffect(() => {
    if (mayImport) load()
  }, [mayImport, load])

  const writes = useMemo(
    () => playerImportWrites(deck, selected, {
      clubId: club?.id ?? '',
      phaseId: phase?.id ?? '',
      seasonId: phase?.seasonId,
      newId: () => `player-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }),
    [deck, selected, club?.id, phase?.id, phase?.seasonId],
  )

  const nothingPicked = writes.created + writes.updated === 0

  const move = (direction: -1 | 1) =>
    setIndex((i) => Math.min(deck.length - 1, Math.max(0, i + direction)))
  const swipe = usePagerSwipe(move)

  const toggleField = (licence: string, key: PlayerSyncField['key']) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const k = fieldKey(licence, key)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  /** Ignore this licensee entirely, or take them back — every field at once. */
  const setRow = (row: PlayerImportRow, taken: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const f of writableFields(row.fields)) {
        const k = fieldKey(row.licence.licence, f.key)
        if (taken) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  /**
   * What the import will write, said once, in the way the platform says a
   * thing that is about to happen.
   *
   * The counts used to sit above the button, which is where a summary stops
   * being read: it is the line you scroll past on the way to the thing you
   * came to press. In the dialog it is the last thing between the decision and
   * the writing, and it costs one tap to back out of.
   */
  const confirmImport = () => {
    Alert.alert('Importer ?', countLine(writes.created, writes.updated), [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Importer', onPress: () => { void runImport() } },
    ])
  }

  const runImport = async () => {
    const { created, updated } = writes
    setStatus({ kind: 'importing' })
    try {
      await applyPlayerImport(writes)
      setStatus({ kind: 'done', created, updated })
    } catch {
      // Say so and stay on the review: the ticks are still there, and the
      // member can try again. Claiming an import that never left the phone is
      // the one outcome worth this much care (#495).
      setStatus({ kind: 'review' })
      Alert.alert(
        'Import interrompu',
        "Une partie de l'import n'a pas été enregistrée. Vérifiez votre connexion et réessayez.",
      )
    }
  }

  if (!mayImport) {
    return (
      <Screen>
        <View style={s.centre}>
          <Text style={s.notice}>
            {club && !club.affiliationNumber
              ? "Ce club n'a pas de numéro d'affiliation FFTT."
              : "Seuls les administrateurs du club peuvent importer les licenciés."}
          </Text>
        </View>
      </Screen>
    )
  }

  if (status.kind === 'loading' || status.kind === 'importing') {
    return (
      <Screen>
        <View style={s.centre}>
          <ActivityIndicator color={colors.accent} />
          <Text style={s.notice}>
            {status.kind === 'loading'
              ? 'Lecture de la liste FFTT…'
              : 'Enregistrement…'}
          </Text>
        </View>
      </Screen>
    )
  }

  if (status.kind === 'error' || status.kind === 'empty') {
    return (
      <Screen>
        <View style={s.centre}>
          <Text style={s.notice}>
            {status.kind === 'error'
              ? 'Impossible de contacter la FFTT. Réessayez plus tard.'
              : `La FFTT ne liste aucun licencié pour le club n° ${club?.affiliationNumber}.`}
          </Text>
          <TouchableOpacity testID="import-retry" style={s.primary} onPress={load}>
            <Text style={s.primaryTxt}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    )
  }

  if (status.kind === 'done') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={[s.scroll, contentWidth()]}>
          <View testID="import-done" style={s.doneCard}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Text style={s.doneTitle}>Import terminé</Text>
            <Text style={s.doneBody}>
              {countLine(status.created, status.updated)}
            </Text>
          </View>
          {missing.length > 0 && <MissingNote missing={missing} />}
          <TouchableOpacity style={s.primary} onPress={() => router.back()}>
            <Text style={s.primaryTxt}>Retour aux joueurs</Text>
          </TouchableOpacity>
        </ScrollView>
      </Screen>
    )
  }

  // --- The review ----------------------------------------------------------
  const row = deck[index]

  return (
    <Screen>
      <ScrollView contentContainerStyle={[s.scroll, contentWidth()]} {...swipe}>
        <Text style={s.lede}>
          {club?.displayName} · n° {club?.affiliationNumber}
        </Text>

        {row ? (
          <>
            <LicenceCard
              row={row}
              selected={selected}
              onToggleField={toggleField}
              onSetRow={setRow}
              position={`${index + 1} / ${deck.length}`}
            />
            {/* Above `MAX_DOTS` this draws nothing and the card's own
                «12 / 60» is the position — a club's licence list is routinely
                longer than a row of dots can indicate. */}
            <PagerDots testID="import-dots" index={index} total={deck.length} />
            {deck.length > 1 && (
              <Text style={s.hint}>
                Balayez pour passer au licencié suivant.
              </Text>
            )}
          </>
        ) : (
          <View style={s.card}>
            <Text style={s.emptyDeck}>
              Rien à écrire : tout ce que la FFTT liste est déjà à jour.
            </Text>
          </View>
        )}

        {upToDate > 0 && (
          <Text style={s.sideNote}>
            {upToDate === 1
              ? '1 licencié est déjà à jour.'
              : `${upToDate} licenciés sont déjà à jour.`}
          </Text>
        )}

        {missing.length > 0 && <MissingNote missing={missing} />}

        {deck.length > 0 && (
          <View style={s.footer}>
            {/* Not the counts — those are the confirmation's. This is the one
                thing the dialog cannot say, because it is a setting of the
                import rather than a consequence of it. */}
            <Text style={s.summaryMeta}>Points enregistrés sur {phase?.displayName}.</Text>
            <TouchableOpacity
              testID="import-apply"
              style={[s.primary, nothingPicked && s.primaryOff]}
              disabled={nothingPicked}
              onPress={confirmImport}
            >
              <Text style={s.primaryTxt}>
                {nothingPicked ? 'Rien de sélectionné' : 'Importer'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

/**
 * What the import amounts to, in words.
 *
 * Stated as a fact and never as a consequence: nothing is removed by an import
 * (`playersMissingFromFftt` is reported, never acted on), so a sentence about
 * what will "disappear" would be untrue — the same care #482 takes.
 */
function countLine(created: number, updated: number): string {
  const parts: string[] = []
  if (created > 0) parts.push(created === 1 ? '1 licencié créé' : `${created} licenciés créés`)
  if (updated > 0) parts.push(updated === 1 ? '1 mis à jour' : `${updated} mis à jour`)
  return parts.length ? `${parts.join(' · ')}.` : 'Rien à écrire.'
}

/**
 * How to call this licensee: the name we already hold, falling back to FFTT's
 * for someone we do not know yet.
 *
 * Printing FFTT's name over a player we hold would read as "this is their name
 * now", when the diff below is the only thing that says what changes — and
 * FFTT exports names unaccented, so its spelling is usually the worse of the
 * two. Same rule as the web's `PlayerImportPreview`.
 */
function rowName(row: PlayerImportRow): string {
  const held = (key: PlayerSyncField['key']) => row.fields.find((f) => f.key === key)?.current
  return `${held('firstName') ?? row.licence.firstName} ${held('lastName') ?? row.licence.lastName}`
}

const STATUS_BADGE: Record<'new' | 'changed', { label: string; bg: string; fg: string }> = {
  new: { label: 'Nouveau', bg: '#dcfce7', fg: '#166534' },
  changed: { label: 'Modifié', bg: '#fef3c7', fg: colors.warningText },
}

function LicenceCard({
  row, selected, onToggleField, onSetRow, position,
}: {
  row: PlayerImportRow
  selected: Set<string>
  onToggleField: (licence: string, key: PlayerSyncField['key']) => void
  onSetRow: (row: PlayerImportRow, taken: boolean) => void
  position: string
}) {
  const fields = writableFields(row.fields)
  const taken = fields.filter((f) => selected.has(fieldKey(row.licence.licence, f.key)))
  const ignored = taken.length === 0
  const badge = STATUS_BADGE[row.status === 'new' ? 'new' : 'changed']

  return (
    <View testID={`import-card-${row.licence.licence}`} style={[s.card, ignored && s.cardIgnored]}>
      <View style={s.cardHead}>
        <View style={s.cardHeadBody}>
          <Text style={s.name} numberOfLines={1}>{rowName(row)}</Text>
          <Text style={s.licence}>
            {row.licence.licence} · {position}
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeTxt, { color: badge.fg }]}>{badge.label}</Text>
        </View>
      </View>

      {row.link && (
        // A namesake the club already holds, with no licence of their own — an
        // approved club admin, most likely (#474). A name is not proof, so this
        // is said and never acted on: the import still creates a licensee.
        <Text style={s.linkNote}>
          {row.link.name} figure déjà dans le club, sans numéro de licence.
        </Text>
      )}

      <View style={s.fields}>
        {fields.map((f) => {
          const on = selected.has(fieldKey(row.licence.licence, f.key))
          return (
            <TouchableOpacity
              key={f.key}
              testID={`import-field-${row.licence.licence}-${f.key}`}
              style={s.field}
              onPress={() => onToggleField(row.licence.licence, f.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={f.label}
            >
              <View style={[s.check, on && s.checkActive]}>
                {on && <Text style={s.checkMark}>✓</Text>}
              </View>
              <View style={s.fieldBody}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <Text style={s.fieldValue}>
                  {f.current !== null && (
                    <>
                      <Text style={s.fieldBefore}>{f.current}</Text>
                      <Text style={s.fieldArrow}> → </Text>
                    </>
                  )}
                  <Text style={s.fieldAfter}>{f.incoming}</Text>
                </Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <TouchableOpacity
        testID={`import-ignore-${row.licence.licence}`}
        style={s.ignore}
        onPress={() => onSetRow(row, ignored)}
      >
        <Ionicons
          name={ignored ? 'refresh-outline' : 'close-circle-outline'}
          size={18}
          color={colors.textSecondary}
        />
        <Text style={s.ignoreTxt}>
          {ignored ? 'Reprendre ce licencié' : 'Ignorer ce licencié'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

/**
 * Who we hold that FFTT's list does not mention — a departure, or a licence not
 * renewed. Reported and never deleted: the club decides what happens to
 * someone's history, not an import.
 *
 * Folded away, because the count is the whole message and the names are the
 * answer to a question only some of them will ask. A club of sixty routinely
 * has fifty-three of these — a season's roster that predates its first import
 * — and open, that is twenty lines of names between the review and the button
 * that acts on it.
 */
function MissingNote({ missing }: { missing: Player[] }) {
  const [open, setOpen] = useState(false)
  return (
    <View testID="import-missing" style={s.note}>
      <TouchableOpacity
        testID="import-missing-toggle"
        style={s.noteHead}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={s.noteHeadBody}>
          <Text style={s.noteTitle}>Absents de la liste FFTT ({missing.length})</Text>
          <Text style={s.noteBody}>
            Licence non renouvelée ou départ. Rien n’est supprimé : à vous d’archiver si besoin.
          </Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {open && (
        <Text testID="import-missing-names" style={s.noteNames}>
          {sortByName(missing).map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
        </Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  scroll: { padding: 12, gap: 12, paddingBottom: 32 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  notice: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', fontFamily: fonts.regular },
  lede: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.regular },

  card: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, padding: 16, gap: 10,
  },
  cardIgnored: { opacity: 0.55 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeadBody: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontFamily: displayFonts.semiBold, color: colors.textPrimary },
  licence: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.regular, letterSpacing: 0.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeTxt: { fontSize: 11, fontFamily: fonts.semiBold },
  linkNote: { fontSize: 13, color: colors.warningText, fontFamily: fonts.regular },

  fields: { gap: 4 },
  // 44pt of target below `md:` — the shared rule for anything tappable.
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  fieldBody: { flex: 1 },
  fieldLabel: {
    fontSize: 11, color: colors.textSecondary, fontFamily: fonts.medium,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  fieldValue: { fontSize: 15, fontFamily: fonts.regular },
  fieldBefore: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  fieldArrow: { color: colors.textSecondary },
  fieldAfter: { color: colors.textPrimary, fontFamily: fonts.semiBold },

  ignore: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4,
  },
  ignoreTxt: { fontSize: 14, color: colors.textSecondary, fontFamily: fonts.medium },

  hint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', fontFamily: fonts.regular },
  sideNote: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.regular },
  emptyDeck: { fontSize: 15, color: colors.textSecondary, fontFamily: fonts.regular },

  note: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, padding: 12, gap: 6,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  noteHeadBody: { flex: 1, gap: 2 },
  noteTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  noteBody: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.regular },
  noteNames: { fontSize: 13, color: colors.textPrimary, fontFamily: fonts.regular },

  footer: { gap: 6, marginTop: 4 },
  summaryMeta: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.regular },
  primary: {
    backgroundColor: colors.accent, borderRadius: 12, minHeight: 48,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 4,
  },
  primaryOff: { backgroundColor: colors.border },
  primaryTxt: { color: '#fff', fontSize: 16, fontFamily: fonts.semiBold },

  doneCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, padding: 20, alignItems: 'center', gap: 8,
  },
  doneTitle: { fontSize: 18, fontFamily: displayFonts.semiBold, color: colors.textPrimary },
  doneBody: { fontSize: 15, color: colors.textSecondary, fontFamily: fonts.regular, textAlign: 'center' },
})
