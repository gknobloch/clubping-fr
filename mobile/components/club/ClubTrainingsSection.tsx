import { useState } from 'react'
import { Alert, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { colors } from '@/constants/colors'
import { AddDatesSheet, TrainingEditorSheet } from '@/components/TrainingEditorSheet'
import { sortByName } from '@shared/lib/sortByName'
import {
  audienceLabel, formatTimeRange, mayManageSchedule, placeLabel, recurrenceLabel, trainingAddress,
  type TrainingDraft, type TrainingResult,
} from '@shared/lib/trainings'
import type { Club, MemberGroup, Training, TrainingSession, User } from '@shared/types'
import { ClubSection, RowIcon, section } from './ClubSection'

// ---------------------------------------------------------------------------
// Entraînements (#608)
//
// Les séries du club — ses créneaux libres et ses séries dirigées : ce qu'il
// entraîne, quand, où et pour qui. Une section du Club, parce qu'elles
// décrivent le club ; leurs séances sont dans l'onglet Entraînements, où
// mène chaque ligne.
//
// Tenues d'ici comme sur le web : un administrateur crée, modifie et supprime
// une série ; lui et les responsables d'une série dirigée y ajoutent des
// dates. Annuler une séance se fait depuis l'onglet Entraînements.
// ---------------------------------------------------------------------------

export function ClubTrainingsSection({
  club,
  series,
  sessions,
  groups,
  users,
  viewer,
  canManage,
  onCreate,
  onUpdate,
  onDelete,
  onAddDates,
}: {
  club: Club
  series: Training[]
  sessions: TrainingSession[]
  groups: MemberGroup[]
  users: User[]
  viewer: User | null
  canManage: boolean
  onCreate: (draft: TrainingDraft) => Promise<TrainingResult>
  onUpdate: (id: string, draft: TrainingDraft) => Promise<TrainingResult>
  onDelete: (id: string) => void
  onAddDates: (trainingId: string, dates: string[]) => void
}) {
  const router = useRouter()
  // `{}` is a new series, `{ training }` an existing one, null nothing open.
  const [editing, setEditing] = useState<{ training?: Training } | null>(null)
  const [addingDatesTo, setAddingDatesTo] = useState<Training | null>(null)
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id)
    return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : null
  }
  const members = sortByName(
    users
      .filter((u) => u.clubId === club.id)
      .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
  )

  const confirmDelete = (t: Training) =>
    Alert.alert(
      `Supprimer « ${t.displayName} » ?`,
      t.kind === 'guided'
        ? 'Toutes ses séances et les réponses données sont supprimées.'
        : 'Le créneau et ses exceptions sont supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(t.id) },
      ],
    )

  return (
    <ClubSection
      title="Entraînements"
      testID="club-trainings"
      action={canManage ? { label: '+ Nouveau', onPress: () => setEditing({}), testID: 'club-training-new' } : undefined}
    >
      {series.length === 0 ? (
        <Text style={section.empty}>Aucun entraînement.</Text>
      ) : (
        series.map((t) => {
          const place = placeLabel(trainingAddress(t, [club]))
          const managers = t.managerIds.map(nameOf).filter(Boolean)
          const runs = mayManageSchedule(viewer, t)
          return (
            <View key={t.id} style={section.row}>
              <TouchableOpacity
                testID={`club-training-${t.id}`}
                style={section.rowMain}
                onPress={() => router.push('/entrainements')}
                accessibilityRole="link"
                accessibilityLabel={`${t.displayName} — voir les séances`}
              >
                <Ionicons name="barbell-outline" size={20} color={colors.textSecondary} style={section.rowIcon} />
                <View style={section.rowBody}>
                  <View style={section.rowTitleLine}>
                    <Text style={section.rowTitle}>{t.displayName}</Text>
                    <View style={section.badge}>
                      <Text style={section.badgeText}>{t.kind === 'guided' ? 'Dirigé' : 'Libre'}</Text>
                    </View>
                  </View>
                  <Text style={section.rowSubtitle}>
                    {t.kind === 'regular' ? recurrenceLabel(t) : formatTimeRange(t)}
                    {place ? ` · ${place}` : ''}
                  </Text>
                  <Text style={section.rowSubtitle}>{audienceLabel(t, groups)}</Text>
                  {managers.length > 0 && (
                    <Text style={section.rowSubtitle}>
                      Responsable{managers.length > 1 ? 's' : ''} : {managers.join(', ')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              {/* Its dates are its managers' too; the series itself, the admins'. */}
              {runs && t.kind === 'guided' && (
                <RowIcon
                  testID={`club-training-dates-${t.id}`}
                  name="calendar-outline"
                  label={`Ajouter des dates — ${t.displayName}`}
                  onPress={() => setAddingDatesTo(t)}
                />
              )}
              {canManage && (
                <>
                  <RowIcon
                    testID={`club-training-edit-${t.id}`}
                    name="create-outline"
                    label={`Modifier ${t.displayName}`}
                    onPress={() => setEditing({ training: t })}
                  />
                  <RowIcon
                    testID={`club-training-delete-${t.id}`}
                    name="trash-outline"
                    label={`Supprimer ${t.displayName}`}
                    danger
                    onPress={() => confirmDelete(t)}
                  />
                </>
              )}
            </View>
          )
        })
      )}

      {editing && (
        <TrainingEditorSheet
          training={editing.training}
          addresses={club.addresses ?? []}
          groups={groups}
          members={members}
          onSave={(draft) => (editing.training ? onUpdate(editing.training.id, draft) : onCreate(draft))}
          onAddDates={onAddDates}
          onClose={() => setEditing(null)}
        />
      )}
      {addingDatesTo && (
        <AddDatesSheet
          training={addingDatesTo}
          existingDates={sessions.filter((x) => x.trainingId === addingDatesTo.id).map((x) => x.date)}
          onAdd={(dates) => onAddDates(addingDatesTo.id, dates)}
          onClose={() => setAddingDatesTo(null)}
        />
      )}
    </ClubSection>
  )
}
