import { describe, it, expect, beforeEach } from 'vitest'
import { forgetReturnPath, readReturnPath, rememberReturnPath } from './returnPath'

describe('returnPath (#747)', () => {
  beforeEach(() => forgetReturnPath())

  it('remembers where a signed-out visit was headed, until forgotten', () => {
    rememberReturnPath('/match/g1?equipe=t1')
    expect(readReturnPath()).toBe('/match/g1?equipe=t1')
    expect(readReturnPath()).toBe('/match/g1?equipe=t1')
    forgetReturnPath()
    expect(readReturnPath()).toBeNull()
  })

  it('never remembers the Accueil or another site', () => {
    rememberReturnPath('/')
    rememberReturnPath('//evil.example/x')
    rememberReturnPath('https://evil.example/x')
    expect(readReturnPath()).toBeNull()
  })
})
