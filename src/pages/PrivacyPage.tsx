import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'

/**
 * Public privacy policy (#356). Google Play and the App Store both require a
 * publicly reachable policy URL for any app collecting personal data, and this
 * one collects a lot: civil identity, contact details, birth date and place,
 * FFTT licence number, and an optional avatar.
 *
 * Deliberately outside the protected layout — store reviewers fetch this URL
 * anonymously, so anything behind the auth guard is useless to them.
 *
 * The content mirrors what the code actually does. Keep it that way: if the app
 * starts collecting something new, or gains an analytics SDK, this page is part
 * of the change, not a follow-up.
 */

// TODO(#356): confirm before publishing to the stores. The data controller and
// its contact address are not derivable from the codebase.
const CONTACT_EMAIL = 'contact@clubping.fr'
const CONTROLLER = 'Club Ping'

/** Last substantive review of this text. Shown to the reader; update when the content changes. */
const LAST_UPDATED = '11 août 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  )
}

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex flex-col items-center text-center">
          <BrandMark className="h-12 w-12 text-slate-900" title="Club Ping" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Politique de confidentialité
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Dernière mise à jour : {LAST_UPDATED}
          </p>
        </header>

        <main className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Section title="Qui traite vos données">
            <p>
              Club Ping est une application de gestion de club de tennis de table : effectifs,
              équipes, disponibilités et composition des rencontres. Les données décrites
              ci-dessous sont traitées par {CONTROLLER}, responsable du traitement, que vous
              pouvez contacter à l'adresse{' '}
              <a className="text-accent-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="Données collectées">
            <p>L'application traite uniquement les données nécessaires à la vie du club :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Identité</strong> : nom, prénom, date et lieu de naissance, numéro de
                licence FFTT.
              </li>
              <li>
                <strong>Coordonnées</strong> : adresse e-mail, numéro de téléphone.
              </li>
              <li>
                <strong>Photo de profil</strong> : facultative, choisie dans votre photothèque ou
                prise avec l'appareil photo. L'accès n'est demandé qu'au moment où vous choisissez
                une photo, et vous pouvez la retirer à tout moment.
              </li>
              <li>
                <strong>Vie sportive</strong> : club et équipes de rattachement, disponibilités,
                compositions d'équipes et résultats des rencontres.
              </li>
            </ul>
            <p>
              L'application ne collecte aucune donnée de localisation, n'accède ni à vos contacts
              ni à votre microphone, et n'enregistre aucun son.
            </p>
          </Section>

          <Section title="Pourquoi, et sur quelle base">
            <p>
              Ces données servent exclusivement à faire fonctionner le club : tenir l'effectif à
              jour, recueillir les disponibilités, composer les équipes, planifier les rencontres
              et en publier les résultats. La base légale est l'exécution de la relation entre le
              club et ses membres, ainsi que l'intérêt légitime du club à organiser sa
              compétition. La photo de profil, elle, repose sur votre consentement.
            </p>
            <p>
              Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires ou
              de profilage.
            </p>
          </Section>

          <Section title="Qui y a accès">
            <p>
              Les membres de votre club voient les informations utiles à la vie sportive : nom,
              prénom, photo de profil, équipes, disponibilités et résultats. Les données plus
              sensibles — coordonnées, date et lieu de naissance, numéro de licence — ne sont
              accessibles qu'aux personnes administrant le club.
            </p>
            <p>
              Aucune donnée n'est transmise à un tiers à des fins commerciales. L'hébergement est
              assuré par Cloudflare, au titre de sous-traitant technique.
            </p>
          </Section>

          <Section title="Traceurs et mesure d'audience">
            <p>
              L'application n'intègre aucun outil de mesure d'audience, aucune régie publicitaire
              et aucun traceur tiers. Le seul élément conservé sur votre appareil est le jeton
              nécessaire à votre session, sans lequel vous devriez vous reconnecter à chaque
              ouverture.
            </p>
          </Section>

          <Section title="Connexion Google et Apple">
            <p>
              Vous pouvez vous connecter avec votre compte Google ou Apple. Dans ce cas,
              l'application reçoit uniquement l'identifiant permettant de vous authentifier et
              votre adresse e-mail. Aucun autre contenu de ces comptes n'est consulté, et aucune
              donnée ne leur est transmise en retour.
            </p>
          </Section>

          <Section title="Durée de conservation">
            <p>
              Vos données sont conservées tant que vous êtes membre du club. Elles sont supprimées
              ou anonymisées lorsque vous le quittez, sauf lorsque le club doit en garder trace
              pour justifier des résultats sportifs d'une saison écoulée.
            </p>
          </Section>

          <Section title="Sécurité">
            <p>
              Les échanges entre l'application et nos serveurs sont chiffrés (HTTPS). L'accès aux
              données est restreint selon le rôle de chaque membre au sein du club.
            </p>
          </Section>

          <Section title="Mineurs">
            <p>
              Les comptes ne se créent pas depuis l'application : ils sont ouverts par les
              responsables du club à partir des informations de licence. Pour un membre mineur,
              ces informations sont fournies par son représentant légal lors de l'inscription au
              club.
            </p>
          </Section>

          <Section title="Vos droits">
            <p>
              Conformément au RGPD, vous disposez d'un droit d'accès, de rectification,
              d'effacement, de limitation, d'opposition et de portabilité sur vos données. Vous
              pouvez les exercer auprès des responsables de votre club ou en écrivant à{' '}
              <a className="text-accent-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . La suppression de votre compte et des données associées peut être demandée par la
              même voie.
            </p>
            <p>
              Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une
              réclamation auprès de la CNIL (
              <a
                className="text-accent-600 underline"
                href="https://www.cnil.fr"
                target="_blank"
                rel="noreferrer"
              >
                www.cnil.fr
              </a>
              ).
            </p>
          </Section>

          <Section title="Modifications">
            <p>
              Cette politique peut évoluer si l'application change. La date de dernière mise à
              jour figure en haut de cette page.
            </p>
          </Section>
        </main>

        <p className="mt-6 text-center text-sm">
          <Link className="text-slate-500 underline hover:text-slate-700" to="/login">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  )
}
