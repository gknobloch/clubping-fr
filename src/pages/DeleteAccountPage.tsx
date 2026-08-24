import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { CONTACT_EMAIL, CONTROLLER } from './legalContact'

/**
 * Public account-deletion page (#434). Google Play's data safety form asks for
 * a deletion URL that names the app, sets out the procedure, and says which
 * data goes and which stays — three things the privacy policy's one paragraph
 * on GDPR rights does not do.
 *
 * Deliberately outside the protected layout, like PrivacyPage: the URL is
 * printed on the store listing and fetched anonymously, so a member who can no
 * longer sign in must still be able to read it.
 *
 * The procedure is by e-mail. Nothing in the app deletes an account today, and
 * a page describing a button that does not exist is worse than no page: keep
 * this text and the app in step if that ever changes.
 *
 * The content must stay true to the data model. Members are registered by their
 * club's administrators — sign-in never creates a row (see functions/api/auth.ts)
 * — which is why the page tells them their club can act on their behalf.
 */

/** Last substantive review of this text. Shown to the reader; update when the content changes. */
const LAST_UPDATED = '24 août 2026'

/** Stated to the reader, so it is one value rather than a number repeated in prose. */
const RESPONSE_DAYS = 30

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  )
}

export function DeleteAccountPage() {
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Suppression de mon compte Club Ping')}`

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex flex-col items-center text-center">
          <BrandMark className="h-12 w-12 text-slate-900" title="Club Ping" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Supprimer votre compte Club Ping
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Dernière mise à jour : {LAST_UPDATED}
          </p>
        </header>

        <main className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Section title="Demander la suppression">
            <p>
              Club Ping est l'application de gestion de votre club de tennis de table. Votre
              compte y est créé par les responsables de votre club, et vous pouvez en demander
              la suppression à tout moment, sans avoir à vous justifier.
            </p>
            <p>Deux voies, au choix :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                écrire à{' '}
                <a className="text-accent-600 underline" href={mailto}>
                  {CONTACT_EMAIL}
                </a>{' '}
                depuis l'adresse e-mail associée à votre compte, en précisant vos nom et prénom
                ainsi que votre club ;
              </li>
              <li>
                ou vous adresser aux responsables de votre club, qui peuvent faire la demande
                pour vous.
              </li>
            </ul>
            <p>
              Écrire depuis l'adresse enregistrée nous permet de vérifier que la demande vient
              bien de vous. Si ce n'est pas possible, {CONTROLLER} vous demandera une
              confirmation par un autre moyen avant de supprimer quoi que ce soit.
            </p>
            <p>
              La demande est traitée sous {RESPONSE_DAYS} jours au plus. Vous recevez une
              confirmation par e-mail une fois la suppression effectuée.
            </p>
          </Section>

          <Section title="Ce qui est supprimé">
            <p>
              Toutes les données qui vous identifient sont effacées, sans conservation d'archive
              nominative :
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>vos nom et prénom ;</li>
              <li>votre adresse e-mail et votre numéro de téléphone ;</li>
              <li>votre date et votre lieu de naissance ;</li>
              <li>votre numéro de licence FFTT ;</li>
              <li>votre photo de profil ;</li>
              <li>la date de votre dernière connexion ;</li>
              <li>
                vos disponibilités déclarées et votre rattachement à un club et à des équipes.
              </li>
            </ul>
            <p>
              Votre compte cesse d'exister : l'application n'envoie plus de code de connexion à
              votre adresse, et vous ne pouvez plus y accéder.
            </p>
          </Section>

          <Section title="Ce qui est conservé">
            <p>
              Les rencontres déjà jouées restent au palmarès du club : compositions d'équipes et
              résultats sont conservés, mais <strong>sous une forme anonyme</strong>, sans aucune
              donnée permettant de vous identifier. Ces feuilles de match sont la mémoire
              sportive du club et concernent aussi vos coéquipiers et vos adversaires ; les
              effacer réécrirait leurs résultats autant que les vôtres.
            </p>
            <p>
              Si vous souhaitez que ces participations passées disparaissent également, précisez-le
              dans votre demande : {CONTROLLER} examinera au cas par cas ce qui peut être fait sans
              amputer les résultats des autres membres.
            </p>
            <p>
              Les sauvegardes techniques de la base de données, qui servent uniquement à restaurer
              le service après incident, se renouvellent d'elles-mêmes sur une fenêtre glissante
              de {RESPONSE_DAYS} jours. Vos données en disparaissent donc au plus tard{' '}
              {RESPONSE_DAYS} jours après la suppression, et ne sont dans l'intervalle utilisées
              à aucune autre fin.
            </p>
          </Section>

          <Section title="Vos autres droits">
            <p>
              La suppression n'est pas votre seule option : le RGPD vous ouvre aussi un droit
              d'accès, de rectification, de limitation, d'opposition et de portabilité. Le détail
              des données traitées et la manière de les exercer figurent dans notre{' '}
              <Link className="text-accent-600 underline" to="/confidentialite">
                politique de confidentialité
              </Link>
              .
            </p>
          </Section>
        </main>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link className="underline hover:text-slate-600" to="/login">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  )
}
