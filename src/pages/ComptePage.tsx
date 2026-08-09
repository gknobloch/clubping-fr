import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { IdentityCard } from '@/components/IdentityCard'
import { fileToAvatar } from '@/lib/avatarFile'
import { getTeamName } from '@/lib/teamName'

export function ComptePage() {
  const { user, displayName, roleLabel, logout } = useAuth()
  const { players, clubs, teams, phases, updatePlayer, setAvatar, removeAvatar } = useAppData()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const me = user?.isPlayer ? players.find((p) => p.id === user.id) : undefined
  const myClub = clubs.find((c) => c.id === (me?.clubId ?? user?.clubId))
  const activePhase = phases.find((p) => p.status === 'active')
  const myTeams = me && activePhase ? teams.filter((t) => t.phaseId === activePhase.id && t.playerIds.includes(me.id)) : []
  const phasePoints = myTeams[0]?.rosterInitialPoints?.[me?.id ?? '']

  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ email: '', phone: '', birthDate: '', birthPlace: '' })

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !me) return
    try {
      setUploading(true)
      const { base64, contentType } = await fileToAvatar(file)
      await setAvatar(me.id, base64, contentType)
    } catch {
      window.alert("La photo n'a pas pu être enregistrée.")
    } finally {
      setUploading(false)
    }
  }

  function startEdit() {
    if (!me) return
    setForm({
      email: me.email ?? '',
      phone: me.phone ?? '',
      birthDate: me.birthDate ?? '',
      birthPlace: me.birthPlace ?? '',
    })
    setEditing(true)
  }

  // E-mail is the sign-in identifier, so you may not take your own away: there
  // is no way back in without one. A member who has none is a different case —
  // they must still be able to edit the rest of their details, and an admin can
  // clear anyone's address from the Joueurs page (#315).
  const removingOwnEmail = !!me?.email && !form.email.trim()

  function saveEdit() {
    if (!me || removingOwnEmail) return
    updatePlayer(me.id, {
      email: form.email.trim(),
      phone: form.phone || undefined,
      birthDate: form.birthDate || undefined,
      birthPlace: form.birthPlace || undefined,
    })
    setEditing(false)
  }

  function handleLogout() {
    if (window.confirm('Se déconnecter ?')) {
      logout()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="space-y-5">
      {/* Identity + avatar */}
      <IdentityCard
        leading={
          <div className="relative shrink-0">
            {me ? (
              <Avatar playerId={me.id} avatarUpdatedAt={me.avatarUpdatedAt} firstName={me.firstName} lastName={me.lastName} size={72} />
            ) : (
              <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-slate-200 text-2xl font-bold text-slate-500">
                {(user?.email?.[0] ?? '?').toUpperCase()}
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-medium text-white">
                …
              </span>
            )}
          </div>
        }
        title={displayName}
      >
        <p className="text-sm text-slate-500">{roleLabel}</p>
        {me && (
          <div className="mt-2 flex items-center gap-4 text-sm">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="font-medium text-accent-600 hover:text-accent-800 disabled:opacity-50">
              Changer la photo
            </button>
            {me.avatarUpdatedAt && (
              <button type="button" onClick={() => removeAvatar(me.id)} disabled={uploading} className="font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50">
                Supprimer
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          </div>
        )}
      </IdentityCard>

      {/* Coordonnées */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coordonnées</h2>
          {me && !editing && (
            <button type="button" onClick={startEdit} className="text-sm font-medium text-accent-600 hover:text-accent-800">
              Modifier
            </button>
          )}
        </div>

        {!me ? (
          <dl className="mt-2 divide-y divide-slate-100">
            <InfoRow label="Email" value={user?.email ?? '—'} />
          </dl>
        ) : editing ? (
          <div className="mt-3 space-y-3">
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
            {removingOwnEmail && (
              <p className="text-sm text-red-600">
                Votre adresse e-mail sert à vous connecter : vous ne pouvez pas la supprimer vous-même.
              </p>
            )}
            <Field label="Téléphone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date de naissance" placeholder="JJ/MM/AAAA" value={form.birthDate} onChange={(v) => setForm((f) => ({ ...f, birthDate: v }))} />
              <Field label="Lieu de naissance" value={form.birthPlace} onChange={(v) => setForm((f) => ({ ...f, birthPlace: v }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                Annuler
              </button>
              <button type="button" onClick={saveEdit} disabled={removingOwnEmail} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50">
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <dl className="mt-2 divide-y divide-slate-100">
            {me.email && <InfoRow label="Email" value={me.email} />}
            {me.phone && <InfoRow label="Téléphone" value={me.phone} />}
            {me.birthDate && <InfoRow label="Date de naissance" value={me.birthDate} />}
            {me.birthPlace && <InfoRow label="Lieu de naissance" value={me.birthPlace} />}
            {me.licenseNumber && <InfoRow label="Licence" value={me.licenseNumber} />}
          </dl>
        )}
      </section>

      {/* Profil */}
      {me && (myClub || myTeams.length > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profil</h2>
          <dl className="mt-2 divide-y divide-slate-100">
            {myClub && <InfoRow label="Club" value={myClub.displayName} />}
            {phasePoints && <InfoRow label="Points" value={phasePoints} />}
            {myTeams.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5">
                <dt className="text-sm text-slate-500">Équipe</dt>
                <dd>
                  <Link to={`/equipes/${t.id}`} className="text-sm font-medium text-accent-600 hover:text-accent-800">
                    {getTeamName(t, clubs)}
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="w-full rounded-2xl border border-red-200 bg-accent-50 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        Déconnexion
      </button>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
      />
    </label>
  )
}
