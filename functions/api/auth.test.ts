// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'

// Cloudflare Workers expose Web Crypto as the global `crypto`; provide it in
// Node. Node has had it natively since 19, so this is a no-op on current
// runtimes — kept for older ones. Read and write through the same cast: the
// worker types declare `crypto` as a bare global, not a property of
// globalThis, so `globalThis.crypto` does not typecheck (#285).
const globalWithCrypto = globalThis as unknown as { crypto?: Crypto }
if (!globalWithCrypto.crypto) globalWithCrypto.crypto = webcrypto as unknown as Crypto

import { genOtp, hashOtp, verifyOidcJwt } from './auth'

// ---------------------------------------------------------------------------
// OTP helpers
// ---------------------------------------------------------------------------
describe('genOtp', () => {
  it('returns a zero-padded 6-digit numeric code', () => {
    for (let i = 0; i < 200; i++) {
      const code = genOtp()
      expect(code).toMatch(/^\d{6}$/)
    }
  })
})

describe('hashOtp', () => {
  it('is deterministic and email-bound', async () => {
    const a = await hashOtp('USER@example.com', '123456')
    const b = await hashOtp('user@example.com', '123456') // case-insensitive email
    const c = await hashOtp('other@example.com', '123456')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ---------------------------------------------------------------------------
// OIDC JWT verification — sign a token locally and verify against a JWKS stub
// ---------------------------------------------------------------------------
const enc = new TextEncoder()

function b64url(bytes: Uint8Array | string): string {
  const arr = typeof bytes === 'string' ? enc.encode(bytes) : bytes
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function makeSignedJwt(
  payload: Record<string, unknown>,
  kid = 'test-key',
): Promise<{ token: string; jwks: { keys: unknown[] } }> {
  // workers-types types generateKey as `CryptoKey | CryptoKeyPair` — it has no
  // per-algorithm overloads narrowing it the way the DOM lib does. RSASSA is
  // asymmetric, so a pair is what comes back.
  const { publicKey, privateKey } = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  // Likewise exportKey: 'jwk' yields a JsonWebKey, but the signature returns
  // `ArrayBuffer | JsonWebKey`. JsonWebKey has no index signature, hence the
  // hop through unknown.
  const jwk = (await crypto.subtle.exportKey('jwk', publicKey)) as unknown as Record<string, unknown>
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }))
  const body = b64url(JSON.stringify(payload))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, enc.encode(`${header}.${body}`))
  const token = `${header}.${body}.${b64url(new Uint8Array(sig))}`
  return { token, jwks: { keys: [{ ...jwk, kid }] } }
}

const ISS = 'https://accounts.google.com'
const AUD = 'client-123.apps.googleusercontent.com'

describe('verifyOidcJwt', () => {
  it('accepts a valid token and returns claims', async () => {
    const { token, jwks } = await makeSignedJwt({
      iss: ISS,
      aud: AUD,
      sub: 'sub-1',
      email: 'player@example.com',
      exp: Math.floor(Date.now() / 1000) + 600,
    })
    const claims = await verifyOidcJwt(token, {
      jwksUrl: 'stub',
      issuers: [ISS],
      audiences: [AUD],
      fetchJwks: async () => jwks as { keys: never[] },
    })
    expect(claims.sub).toBe('sub-1')
    expect(claims.email).toBe('player@example.com')
  })

  it('rejects a wrong audience', async () => {
    const { token, jwks } = await makeSignedJwt({
      iss: ISS,
      aud: 'someone-else',
      sub: 'sub-1',
      exp: Math.floor(Date.now() / 1000) + 600,
    })
    await expect(
      verifyOidcJwt(token, { jwksUrl: 'stub', issuers: [ISS], audiences: [AUD], fetchJwks: async () => jwks as { keys: never[] } }),
    ).rejects.toThrow(/audience/)
  })

  it('rejects an expired token', async () => {
    const { token, jwks } = await makeSignedJwt({
      iss: ISS,
      aud: AUD,
      sub: 'sub-1',
      exp: Math.floor(Date.now() / 1000) - 10,
    })
    await expect(
      verifyOidcJwt(token, { jwksUrl: 'stub', issuers: [ISS], audiences: [AUD], fetchJwks: async () => jwks as { keys: never[] } }),
    ).rejects.toThrow(/expired/)
  })

  it('rejects a tampered signature', async () => {
    const { token, jwks } = await makeSignedJwt({
      iss: ISS,
      aud: AUD,
      sub: 'sub-1',
      exp: Math.floor(Date.now() / 1000) + 600,
    })
    // Flip the payload but keep the original signature.
    const [h, , s] = token.split('.')
    const forged = `${h}.${b64url(JSON.stringify({ iss: ISS, aud: AUD, sub: 'attacker', exp: Math.floor(Date.now() / 1000) + 600 }))}.${s}`
    await expect(
      verifyOidcJwt(forged, { jwksUrl: 'stub', issuers: [ISS], audiences: [AUD], fetchJwks: async () => jwks as { keys: never[] } }),
    ).rejects.toThrow(/signature/)
  })
})
