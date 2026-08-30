import { describe, it, expect } from 'vitest'
import {
  emailMatch,
  isDecidedRequest,
  isLiveRequest,
  requestStatusBadge,
  requestStatusLabel,
  isPlausibleEmail,
  isValidAffiliationNumber,
  maskEmail,
  maskPhone,
  validateRequestForm,
  EMAIL_MATCH_LABELS,
  REQUEST_REFUSAL_MESSAGES,
} from './clubAdminRequests'

describe('emailMatch (#474)', () => {
  it('recognises the published address exactly, ignoring case and spacing', () => {
    expect(emailMatch('pparixheim@gmail.com', 'pparixheim@gmail.com')).toBe('exact')
    expect(emailMatch('  PPARixheim@Gmail.com ', 'pparixheim@gmail.com')).toBe('exact')
  })

  it('recognises a shared club domain', () => {
    expect(emailMatch('president@mulhousett.com', 'contact@mulhousett.com')).toBe('domain')
  })

  // The whole point of the domain signal is that the domain belongs to the
  // club. Two gmail addresses share nothing worth reporting.
  it('does not treat a shared free-mail domain as a signal', () => {
    expect(emailMatch('quentin@gmail.com', 'pparixheim@gmail.com')).toBe('different')
    expect(emailMatch('a@orange.fr', 'mulhouse-tt@orange.fr')).toBe('different')
  })

  it('reports a different address plainly, which is not an accusation', () => {
    expect(emailMatch('quentin.colle@example.fr', 'pparixheim@gmail.com')).toBe('different')
  })

  it('is unknown when either side has no address', () => {
    expect(emailMatch('q@example.fr', '')).toBe('unknown')
    expect(emailMatch('', 'pparixheim@gmail.com')).toBe('unknown')
    expect(emailMatch(undefined, undefined)).toBe('unknown')
    expect(emailMatch('q@example.fr', null)).toBe('unknown')
  })

  it('has French wording for every verdict', () => {
    for (const v of ['exact', 'domain', 'different', 'unknown'] as const) {
      expect(EMAIL_MATCH_LABELS[v]).toMatch(/\S/)
    }
  })
})

describe('maskEmail (#474)', () => {
  it('keeps the first letter and the domain, hiding the rest', () => {
    expect(maskEmail('pparixheim@gmail.com')).toBe('p•••••@gmail.com')
    expect(maskEmail('Mulhouse-tennis-de-table@orange.fr')).toBe('M•••••@orange.fr')
  })

  // The length of the local part is itself a clue, so the mask is fixed.
  it('hides how long the address is', () => {
    expect(maskEmail('a@x.fr')).toBe(maskEmail('averylonglocalpart@x.fr').replace('averylonglocalpart'[0], 'a'))
    expect(maskEmail('ab@x.fr')).toBe('a•••••@x.fr')
  })

  it('gives nothing away for something that is not an address', () => {
    expect(maskEmail('not-an-address')).toBe('•••••')
    expect(maskEmail('@nolocal.fr')).toBe('•••••')
  })

  it('is empty for an empty input', () => {
    expect(maskEmail('')).toBe('')
    expect(maskEmail(undefined)).toBe('')
    expect(maskEmail('   ')).toBe('')
  })
})

describe('maskPhone (#474)', () => {
  it('keeps the last two digits, which is enough to recognise a number', () => {
    expect(maskPhone('0672124915')).toBe('••••••15')
    expect(maskPhone('06 86 83 99 57')).toBe('••••••57')
  })

  it('reveals nothing from a number too short to mask', () => {
    expect(maskPhone('12')).toBe('••••')
    expect(maskPhone('')).toBe('')
  })
})

describe('isValidAffiliationNumber (#474)', () => {
  it('accepts the 8 digits FFTT prints', () => {
    expect(isValidAffiliationNumber('06680011')).toBe(true)
    expect(isValidAffiliationNumber(' 06680105 ')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const bad of ['', '123', '0668001', '066800111', '0668001a', undefined, null]) {
      expect(isValidAffiliationNumber(bad)).toBe(false)
    }
  })
})

describe('isPlausibleEmail (#474)', () => {
  it('accepts an ordinary address', () => {
    expect(isPlausibleEmail('quentin.colle@example.fr')).toBe(true)
  })

  it('rejects what could not possibly be one', () => {
    for (const bad of ['', 'nope', 'a@b', 'a b@c.fr', '@c.fr', 'a@.fr']) {
      expect(isPlausibleEmail(bad)).toBe(false)
    }
  })
})

describe('validateRequestForm (#474)', () => {
  const good = {
    affiliationNumber: '06680011',
    email: 'quentin.colle@example.fr',
    firstName: 'Quentin',
    lastName: 'Colle',
  }

  it('passes a complete form', () => {
    expect(validateRequestForm(good)).toBeNull()
  })

  it('names what is wrong, one thing at a time', () => {
    expect(validateRequestForm({ ...good, affiliationNumber: '12' })).toBe('invalid_affiliation')
    expect(validateRequestForm({ ...good, firstName: '  ' })).toBe('missing_name')
    expect(validateRequestForm({ ...good, lastName: '' })).toBe('missing_name')
    expect(validateRequestForm({ ...good, email: 'nope' })).toBe('invalid_email')
  })

  it('has French wording for every refusal', () => {
    for (const r of [
      'invalid_affiliation', 'invalid_email', 'missing_name', 'already_pending', 'already_admin',
    ] as const) {
      expect(REQUEST_REFUSAL_MESSAGES[r]).toMatch(/\S/)
    }
  })
})

// A queue that files work under "done" because it does not recognise the
// status is worse than one that shows too much: the work vanishes from the
// only person who can do it. This came from a real sighting — a page built
// before `pending_admin` existed put every club-confirmed request under
// "demandes traitées", blank-badged and with no way to act on it.
describe('what counts as done (#474)', () => {
  it('closes on the two decided states, and only those', () => {
    expect(isDecidedRequest('approved')).toBe(true)
    expect(isDecidedRequest('rejected')).toBe(true)
    expect(isDecidedRequest('pending_club')).toBe(false)
    expect(isDecidedRequest('pending_admin')).toBe(false)
  })

  it('treats a status it has never heard of as still live', () => {
    for (const unknown of ['pending', 'pending_league', 'escalated', '']) {
      expect(isDecidedRequest(unknown)).toBe(false)
      expect(isLiveRequest(unknown)).toBe(true)
    }
  })

  it('is exactly the inverse of live', () => {
    for (const s of ['approved', 'rejected', 'pending_club', 'pending_admin', 'wat']) {
      expect(isLiveRequest(s)).toBe(!isDecidedRequest(s))
    }
  })
})

describe('status labels never come back blank (#474)', () => {
  it('names each state it knows', () => {
    expect(requestStatusLabel('pending_club')).toBe('En attente du club')
    expect(requestStatusLabel('pending_admin')).toBe('À traiter')
    expect(requestStatusLabel('approved')).toBe('Approuvée')
    expect(requestStatusLabel('rejected')).toBe('Refusée')
  })

  // An unexplained blank chip tells a reader nothing; the raw status at least
  // tells them the page is older than the data.
  it('shows an unknown status as itself rather than as nothing', () => {
    expect(requestStatusLabel('pending_league')).toBe('pending_league')
    expect(requestStatusBadge('pending_league')).toMatch(/\S/)
  })
})
