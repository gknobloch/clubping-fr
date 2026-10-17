import { useState } from 'react'
import { useAppData } from '@/contexts/DataContext'
import { ICON_TARGET_CLASS } from '@/components/Button'
import { ModalShell } from '@/components/ModalShell'
import { ChevronRightIcon, LinkIcon, ShareIcon, WhatsAppIcon } from '@/components/icons'
import { gameShareMessage, gameShareUrl, whatsAppShareUrl } from '@/lib/gameShare'
import type { Game, MatchDay, Team } from '@/types'

/**
 * "Partager le match" (#747) — the link, WhatsApp, and the team's own group.
 *
 * The link names the sender's team only as a hint: whoever opens it lands on
 * their own side, under the profile that plays it (`sharedGameOpening`).
 */
export function ShareGameButton({ game, matchDay, team, z }: {
  game: Game
  matchDay: MatchDay
  /** The side of the fixture on screen — the sender's. */
  team: Team
  /** Stacking level: above the match dialog (40) when it opens from there. */
  z?: 30 | 40 | 50
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Partager le match"
        aria-label="Partager le match"
        className={`shrink-0 text-slate-500 transition-colors hover:text-accent-600 ${ICON_TARGET_CLASS}`}
      >
        <ShareIcon className="h-6 w-6 md:h-5 md:w-5" />
      </button>
      {open && <ShareGameDialog game={game} matchDay={matchDay} team={team} z={z} onClose={() => setOpen(false)} />}
    </>
  )
}

type Done = 'link' | 'group' | 'failed' | null

function ShareGameDialog({ game, matchDay, team, z, onClose }: {
  game: Game
  matchDay: MatchDay
  team: Team
  z?: 30 | 40 | 50
  onClose: () => void
}) {
  const { teams, clubs } = useAppData()
  const [done, setDone] = useState<Done>(null)

  // The origin the member is on: a preview shares a preview, which is the
  // only link that would show the same data.
  const url = gameShareUrl({ gameId: game.id, teamId: team.id }, window.location.origin)
  const message = gameShareMessage({ game, matchDay, teams, clubs, url })
  const canShare = typeof navigator.share === 'function'

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  async function copyLink() {
    setDone((await copy(url)) ? 'link' : 'failed')
  }

  // WhatsApp cannot be told to post into a given group: an invite link only
  // opens it. So the message goes to the clipboard, and the sentence under the
  // row says to paste it. The copy starts in the click itself, before the link
  // opens: once the new tab has focus, the page may no longer write to the
  // clipboard, and a `window.open` after an await is a popup Safari blocks.
  function shareToGroup() {
    void copy(message).then((copied) => setDone(copied ? 'group' : 'failed'))
  }

  async function shareNative() {
    try {
      await navigator.share({ text: message })
      onClose()
    } catch {
      /* dismissed: stay on the choices */
    }
  }

  const row = 'flex min-h-11 w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 last:border-b-0'

  return (
    <ModalShell onClose={onClose} labelledBy="share-game-title" closeOnBackdrop z={z}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="share-game-title" className="font-display text-lg font-semibold text-slate-800">
              Partager le match
            </h2>
            <p className="mt-1 whitespace-pre-line break-words text-xs text-slate-500" data-testid="share-game-message">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className={`shrink-0 text-slate-400 hover:text-slate-600 ${ICON_TARGET_CLASS}`}
          >
            ✕
          </button>
        </div>
        <ul>
          {team.whatsappLink && (
            <li>
              <a
                href={team.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className={row}
                onClick={shareToGroup}
              >
                <WhatsAppIcon className="h-5 w-5 shrink-0 text-green-600" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-800">Dans le groupe de l'équipe</span>
                  <span className="block text-xs text-slate-500">
                    {done === 'group' ? 'Message copié : collez-le dans le groupe.' : 'Copie le message et ouvre le groupe WhatsApp'}
                  </span>
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
              </a>
            </li>
          )}
          <li>
            <a
              href={whatsAppShareUrl(message)}
              target="_blank"
              rel="noopener noreferrer"
              className={row}
              onClick={onClose}
            >
              <WhatsAppIcon className="h-5 w-5 shrink-0 text-green-600" />
              <span className="flex-1 font-medium text-slate-800">Envoyer sur WhatsApp</span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
            </a>
          </li>
          <li>
            <button type="button" className={row} onClick={copyLink}>
              <LinkIcon className="h-5 w-5 shrink-0 text-slate-500" />
              <span className="flex-1 font-medium text-slate-800">
                {done === 'link' ? 'Lien copié' : 'Copier le lien'}
              </span>
            </button>
          </li>
          {canShare && (
            <li>
              <button type="button" className={row} onClick={shareNative}>
                <ShareIcon className="h-5 w-5 shrink-0 text-slate-500" />
                <span className="flex-1 font-medium text-slate-800">Autres applications…</span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
              </button>
            </li>
          )}
        </ul>
        {done === 'failed' && (
          <p role="alert" className="border-t border-slate-100 px-4 py-3 text-sm text-red-600">
            Impossible de copier. Le lien : <span className="break-all">{url}</span>
          </p>
        )}
      </div>
    </ModalShell>
  )
}
