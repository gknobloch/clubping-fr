import { useAppData } from '@/contexts/DataContext'
import { licencesOf } from '@/lib/licences'
import type { User } from '@/types'

/**
 * A member's licence numbers on one line (#644): « 6810333 » while the FFTT is
 * the only federation there is — what the lists always printed — and each
 * number tagged with its federation once there is another
 * (« FFTT 6810333 · AGR 1251178 »).
 */
export function LicenceNumbers({ member }: { member: Pick<User, 'licenseNumber' | 'licences'> }) {
  const { federations = [] } = useAppData()
  const licences = licencesOf(member)
  if (licences.length === 0) return null
  const tagged = federations.length > 1
  return (
    <>
      {licences.map((l, i) => (
        <span key={l.federationId}>
          {i > 0 && ' · '}
          {tagged && (
            <span className="font-sans">
              {federations.find((f) => f.id === l.federationId)?.shortName ?? l.federationId.toUpperCase()}{' '}
            </span>
          )}
          <span className="font-mono">{l.number}</span>
        </span>
      ))}
    </>
  )
}

