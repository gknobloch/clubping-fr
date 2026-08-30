import type { OutgoingEmail } from './email'

/**
 * What the onboarding flow says, in French, in one place (#474).
 *
 * Kept apart from the routes because the wording is the part most likely to be
 * argued over and least likely to be read in a diff full of SQL. Every message
 * here is transactional and short: someone asked for something, or someone
 * decided something.
 *
 * One rule runs through all of them — **never say more than the recipient is
 * entitled to know**. The correspondent is told someone asked, not who else is
 * in the queue. The requester is told the decision, not who took it.
 */

/** Who a message is about, in the words the messages need. */
export interface RequestSummary {
  firstName: string
  lastName: string
  email: string
  phone: string
  message: string
  licenseNumber: string
  affiliationNumber: string
  clubName: string
}

const who = (r: RequestSummary) => `${r.firstName} ${r.lastName}`.trim()

const requesterBlock = (r: RequestSummary) =>
  [
    `Nom       : ${who(r)}`,
    `E-mail    : ${r.email}`,
    ...(r.phone ? [`Téléphone : ${r.phone}`] : []),
    ...(r.licenseNumber ? [`Licence   : ${r.licenseNumber}`] : []),
    ...(r.message ? ['', `Ce qu’elle dit être : ${r.message}`] : []),
  ].join('\n')

const SIGN_OFF = '\n\n—\nClub Ping'

/**
 * Step 1 → 2. To the address FFTT publishes for the club.
 *
 * The link is the whole message. It carries a one-shot token, so the wording
 * has to be plain about what clicking it does — and equally plain that doing
 * nothing is a valid answer, since the alternative is a club feeling obliged
 * to click something it does not understand.
 */
export function clubConfirmationEmail(
  to: string,
  r: RequestSummary,
  confirmUrl: string,
): OutgoingEmail {
  return {
    to,
    subject: `${r.clubName} : une personne demande à administrer votre club sur Club Ping`,
    text: [
      `Bonjour,`,
      ``,
      `Vous recevez ce message parce que la FFTT vous indique comme correspondant`,
      `du club ${r.clubName} (n° ${r.affiliationNumber}).`,
      ``,
      `Cette personne demande à administrer votre club sur Club Ping :`,
      ``,
      requesterBlock(r),
      ``,
      `Si vous la reconnaissez, confirmez la demande :`,
      confirmUrl,
      ``,
      `Elle sera ensuite examinée par un administrateur de Club Ping — votre`,
      `confirmation ne lui donne pas encore accès.`,
      ``,
      `Si vous ne reconnaissez pas cette personne, ignorez ce message : sans`,
      `votre confirmation, la demande n’ira pas plus loin. Le lien expire dans`,
      `7 jours.`,
    ].join('\n') + SIGN_OFF,
  }
}

/** Step 2 → 3. To every general admin, once the club has confirmed. */
export function newRequestForAdminEmail(
  to: string,
  r: RequestSummary,
  confirmedBy: string,
  queueUrl: string,
): OutgoingEmail {
  return {
    to,
    subject: `Demande à traiter : ${r.clubName}`,
    text: [
      `Une demande d’administration de club a été confirmée par le club et`,
      `attend votre décision.`,
      ``,
      `Club : ${r.clubName} (n° ${r.affiliationNumber})`,
      ``,
      requesterBlock(r),
      ``,
      confirmedBy
        ? `Confirmée depuis l’adresse : ${confirmedBy}`
        : `Aucun correspondant n’était publié par la FFTT : cette demande n’a pas`
          + `\npu être confirmée par le club.`,
      ``,
      `Vérifiez la demande auprès de la FFTT avant de l’accepter :`,
      queueUrl,
    ].join('\n') + SIGN_OFF,
  }
}

/**
 * Step 3, either way. Sent to the requester and to the club's address, which
 * is why it never carries anything the club should not read.
 */
export function decisionEmail(
  to: string,
  r: RequestSummary,
  decision: 'approved' | 'rejected',
  note: string,
  loginUrl: string,
): OutgoingEmail {
  if (decision === 'approved') {
    return {
      to,
      subject: `${r.clubName} : demande acceptée`,
      text: [
        `Bonjour,`,
        ``,
        `La demande de ${who(r)} pour administrer ${r.clubName} sur Club Ping a`,
        `été acceptée.`,
        ``,
        `Connexion avec l’adresse ${r.email} :`,
        loginUrl,
        ``,
        `Aucun mot de passe : un code à usage unique est envoyé à cette adresse`,
        `à chaque connexion.`,
        ...(note ? ['', `Note de l’administrateur : ${note}`] : []),
      ].join('\n') + SIGN_OFF,
    }
  }
  return {
    to,
    subject: `${r.clubName} : demande refusée`,
    text: [
      `Bonjour,`,
      ``,
      `La demande de ${who(r)} pour administrer ${r.clubName} sur Club Ping n’a`,
      `pas été acceptée.`,
      ...(note ? ['', `Motif : ${note}`] : []),
      ``,
      `Si vous pensez qu’il s’agit d’une erreur, vous pouvez déposer une`,
      `nouvelle demande.`,
    ].join('\n') + SIGN_OFF,
  }
}
