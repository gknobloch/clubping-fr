import { useState, useEffect, useRef } from 'react'
import type { Address, Club, ClubChannel, ClubChannelType } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { useClubAddressFormState } from '@/pages/useClubAddressForm'
import { WhatsAppIcon } from '@/components/icons'
import { PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import { useConfirm } from '@/components/useConfirm'

const emptyAddressForm = {
  label: '',
  street: '',
  postalCode: '',
  city: '',
  isDefault: false,
}

const CHANNEL_TYPES: { value: ClubChannelType; label: string }[] = [
  { value: 'website', label: 'Site web' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'other', label: 'Autre' },
]

// eslint-disable-next-line react-refresh/only-export-components -- shared label helper, used by MyClubPage
export const channelTypeLabel = (t: ClubChannelType) =>
  CHANNEL_TYPES.find((x) => x.value === t)?.label ?? t

const emptyChannelForm = { type: 'website' as ClubChannelType, link: '', displayName: '' }

// Small inline icon per channel type — the web app has no icon library, so these
// keep the admin list legible. The mobile/header display (deferred) reuses the
// matching Ionicons (globe-outline / logo-whatsapp / logo-facebook / link-outline).
export function ChannelIcon({ type }: { type: ClubChannelType }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'whatsapp':
      return <WhatsAppIcon className="h-4 w-4" />
    case 'facebook':
      return (<svg {...common}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3Z" /></svg>)
    case 'website':
      return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>)
    default: // other
      return (<svg {...common}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>)
  }
}

// Read an image file, downscale it to maxDim, and return base64 (no data: prefix).
async function fileToDownscaledBase64(
  file: File,
  maxDim = 256,
): Promise<{ base64: string; contentType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('image load failed'))
    i.src = dataUrl
  })
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return { base64: canvas.toDataURL('image/png').split(',')[1], contentType: 'image/png' }
}

export interface ClubDetailViewProps {
  club: Club
  canEdit: boolean
  /** When true, N° affiliation can be edited (reserved for global admin). Default false. */
  canEditAffiliationNumber?: boolean
  /** Prefix for input ids to avoid duplicates when multiple instances exist. */
  idPrefix?: string
}

export function ClubDetailView({
  club,
  canEdit,
  canEditAffiliationNumber = false,
  idPrefix = 'club-detail',
}: ClubDetailViewProps) {
  const {
    updateClub, addClubAddress, updateClubAddress, deleteClubAddress,
    setClubLogo, removeClubLogo,
    addClubChannel, updateClubChannel, deleteClubChannel, reorderClubChannels,
  } = useAppData()
  const [form, setForm] = useState({ affiliationNumber: club.affiliationNumber, displayName: club.displayName })
  const [addressForm, setAddressForm] = useClubAddressFormState()
  const [addressFields, setAddressFields] = useState(emptyAddressForm)
  const [channelForm, setChannelForm] = useState<{ mode: 'add' } | { mode: 'edit'; channel: ClubChannel } | null>(null)
  const [channelFields, setChannelFields] = useState(emptyChannelForm)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [confirm, confirmDialog] = useConfirm()

  useEffect(() => {
    setForm({
      affiliationNumber: club.affiliationNumber,
      displayName: club.displayName,
    })
  }, [club.id, club.affiliationNumber, club.displayName])

  const handleSaveClub = () => {
    updateClub(club.id, form)
  }

  const openAddAddress = () => {
    setAddressForm({ mode: 'add' })
    setAddressFields(emptyAddressForm)
  }

  const openEditAddress = (address: Address) => {
    setAddressForm({ mode: 'edit', address })
    setAddressFields({
      label: address.label,
      street: address.street,
      postalCode: address.postalCode,
      city: address.city,
      isDefault: address.isDefault,
    })
  }

  const closeAddressForm = () => {
    setAddressForm(null)
  }

  const handleSaveAddress = () => {
    if (addressForm?.mode === 'add') {
      addClubAddress(club.id, addressFields)
      closeAddressForm()
    } else if (addressForm?.mode === 'edit') {
      updateClubAddress(club.id, addressForm.address.id, addressFields)
      closeAddressForm()
    }
  }

  const handleDeleteAddress = async (addressId: string) => {
    if (await confirm({ title: 'Supprimer cette adresse ?', confirmLabel: 'Supprimer' })) {
      deleteClubAddress(club.id, addressId)
      if (addressForm?.mode === 'edit' && addressForm.address.id === addressId) {
        closeAddressForm()
      }
    }
  }

  const handleSetDefaultAddress = (addressId: string) => {
    updateClubAddress(club.id, addressId, { isDefault: true })
  }

  // --- Logo ---
  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      window.alert('Image trop volumineuse (max 5 Mo).')
      return
    }
    try {
      const { base64, contentType } = await fileToDownscaledBase64(file)
      setClubLogo(club.id, base64, contentType)
    } catch {
      window.alert("Impossible de traiter l'image.")
    }
  }

  const handleRemoveLogo = async () => {
    if (await confirm({ title: 'Supprimer le logo du club ?', confirmLabel: 'Supprimer' })) removeClubLogo(club.id)
  }

  // --- Channels ---
  const openAddChannel = () => {
    setChannelForm({ mode: 'add' })
    setChannelFields(emptyChannelForm)
  }

  const openEditChannel = (channel: ClubChannel) => {
    setChannelForm({ mode: 'edit', channel })
    setChannelFields({ type: channel.type, link: channel.link, displayName: channel.displayName ?? '' })
  }

  const closeChannelForm = () => setChannelForm(null)

  const handleSaveChannel = () => {
    if (channelForm?.mode === 'add') {
      addClubChannel(club.id, channelFields)
    } else if (channelForm?.mode === 'edit') {
      updateClubChannel(club.id, channelForm.channel.id, channelFields)
    }
    closeChannelForm()
  }

  const handleDeleteChannel = async (channelId: string) => {
    if (await confirm({ title: 'Supprimer ce canal ?', confirmLabel: 'Supprimer' })) {
      deleteClubChannel(club.id, channelId)
      if (channelForm?.mode === 'edit' && channelForm.channel.id === channelId) closeChannelForm()
    }
  }

  const moveChannel = (index: number, dir: -1 | 1) => {
    const ids = channels.map((ch) => ch.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderClubChannels(club.id, ids)
  }

  const addresses = club.addresses ?? []
  const channels = [...(club.channels ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const logoUrl = club.logoUpdatedAt
    ? `/api/clubs/${club.id}/logo?v=${encodeURIComponent(club.logoUpdatedAt)}`
    : null

  return (
    <>
      {confirmDialog}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-medium text-slate-800">Informations du club</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor={`${idPrefix}-affiliationNumber`}
              className="block text-sm font-medium text-slate-700"
            >
              N° affiliation
            </label>
            <input
              id={`${idPrefix}-affiliationNumber`}
              type="text"
              value={form.affiliationNumber}
              onChange={(e) =>
                canEdit &&
                canEditAffiliationNumber &&
                setForm((f) => ({ ...f, affiliationNumber: e.target.value }))
              }
              readOnly={!canEdit || !canEditAffiliationNumber}
              className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-slate-50 disabled:text-slate-600"
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}-displayName`}
              className="block text-sm font-medium text-slate-700"
            >
              Nom
            </label>
            <input
              id={`${idPrefix}-displayName`}
              type="text"
              value={form.displayName}
              onChange={(e) => canEdit && setForm((f) => ({ ...f, displayName: e.target.value }))}
              readOnly={!canEdit}
              className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-slate-50 disabled:text-slate-600"
            />
          </div>
        </div>
        {canEdit && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSaveClub}
              className={PRIMARY_BUTTON_CLASS}
            >
              Enregistrer
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-slate-800">
            Adresses (lieux de jeu)
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={openAddAddress}
              className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
            >
              Ajouter une adresse
            </button>
          )}
        </div>
        <ul className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          {addresses.length === 0 && !addressForm && (
            <li className="text-sm text-slate-500">Aucune adresse.</li>
          )}
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium text-slate-900">{a.label}</span>
                {a.isDefault && (
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                    Par défaut
                  </span>
                )}
                <p className="text-slate-600">
                  {a.street}, {a.postalCode} {a.city}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditAddress(a)}
                    className="text-accent-600 hover:text-accent-800"
                  >
                    Modifier
                  </button>
                  {!a.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultAddress(a.id)}
                      className="text-slate-600 hover:text-slate-800"
                    >
                      Par défaut
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(a.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {canEdit && addressForm && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-slate-700">
              {addressForm.mode === 'add' ? 'Nouvelle adresse' : "Modifier l'adresse"}
            </h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Libellé</label>
                <input
                  type="text"
                  value={addressFields.label}
                  onChange={(e) => setAddressFields((f) => ({ ...f, label: e.target.value }))}
                  placeholder="ex. Gymnase principal"
                  className="mt-0.5 w-full min-h-[44px] md:min-h-0 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Rue</label>
                <input
                  type="text"
                  value={addressFields.street}
                  onChange={(e) => setAddressFields((f) => ({ ...f, street: e.target.value }))}
                  className="mt-0.5 w-full min-h-[44px] md:min-h-0 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600">Code postal</label>
                  <input
                    type="text"
                    value={addressFields.postalCode}
                    onChange={(e) =>
                      setAddressFields((f) => ({ ...f, postalCode: e.target.value }))
                    }
                    className="mt-0.5 w-full min-h-[44px] md:min-h-0 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex-[2]">
                  <label className="block text-xs font-medium text-slate-600">Ville</label>
                  <input
                    type="text"
                    value={addressFields.city}
                    onChange={(e) => setAddressFields((f) => ({ ...f, city: e.target.value }))}
                    className="mt-0.5 w-full min-h-[44px] md:min-h-0 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addressFields.isDefault}
                  onChange={(e) =>
                    setAddressFields((f) => ({ ...f, isDefault: e.target.checked }))
                  }
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Adresse par défaut</span>
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAddressForm}
                className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveAddress}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-700"
              >
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Logo */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-medium text-slate-800">Logo du club</h2>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {logoUrl ? (
              <img src={logoUrl} alt={`Logo ${club.displayName}`} className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-slate-400">Aucun</span>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-col gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className={PRIMARY_BUTTON_CLASS}
              >
                {logoUrl ? 'Remplacer le logo' : 'Ajouter un logo'}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="text-sm font-medium text-red-600 hover:text-red-800"
                >
                  Supprimer
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Communication channels */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-slate-800">
            Canaux de communication
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={openAddChannel}
              className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
            >
              Ajouter un canal
            </button>
          )}
        </div>
        <ul className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          {channels.length === 0 && !channelForm && (
            <li className="text-sm text-slate-500">Aucun canal.</li>
          )}
          {channels.map((ch, i) => (
            <li
              key={ch.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                {canEdit && (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveChannel(i, -1)}
                      disabled={i === 0}
                      aria-label="Monter"
                      className="leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveChannel(i, 1)}
                      disabled={i === channels.length - 1}
                      aria-label="Descendre"
                      className="leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                )}
                <span className="text-slate-500">
                  <ChannelIcon type={ch.type} />
                </span>
                <div className="min-w-0">
                  <span className="font-medium text-slate-900">
                    {ch.displayName?.trim() || channelTypeLabel(ch.type)}
                  </span>
                  {ch.displayName?.trim() && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {channelTypeLabel(ch.type)}
                    </span>
                  )}
                  <p className="truncate text-slate-600">
                    <a href={ch.link} target="_blank" rel="noreferrer" className="hover:underline">
                      {ch.link}
                    </a>
                  </p>
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditChannel(ch)}
                    className="text-accent-600 hover:text-accent-800"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(ch.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {canEdit && channelForm && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-slate-700">
              {channelForm.mode === 'add' ? 'Nouveau canal' : 'Modifier le canal'}
            </h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Type</label>
                <select
                  value={channelFields.type}
                  onChange={(e) =>
                    setChannelFields((f) => ({ ...f, type: e.target.value as ClubChannelType }))
                  }
                  className="mt-0.5 w-full min-h-[44px] md:min-h-0 rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {CHANNEL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Nom affiché <span className="font-normal text-slate-400">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={channelFields.displayName}
                  onChange={(e) => setChannelFields((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder={channelTypeLabel(channelFields.type)}
                  className="mt-0.5 w-full min-h-[44px] md:min-h-0 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Lien</label>
                <input
                  type="text"
                  value={channelFields.link}
                  onChange={(e) => setChannelFields((f) => ({ ...f, link: e.target.value }))}
                  placeholder="https://..."
                  className="mt-0.5 w-full min-h-[44px] md:min-h-0 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeChannelForm}
                className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveChannel}
                disabled={!channelFields.link.trim()}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-700 disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
