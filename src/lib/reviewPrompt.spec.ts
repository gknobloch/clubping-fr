import { describe, expect, it } from 'vitest'
import {
  REVIEW_INTERVAL_DAYS, REVIEW_MAX_ASKS, REVIEW_MIN_AGE_DAYS, REVIEW_MIN_ANSWERS,
  applyReviewEvent, mergeReviewPromptStates, reviewPromptDue, type ReviewPromptState,
} from './reviewPrompt'

const DAY = 86_400_000
const NOW = 1_800_000_000_000
const seasoned: ReviewPromptState = { firstSeenAt: NOW - 30 * DAY, askedCount: 0 }

describe('reviewPromptDue', () => {
  it('asks someone who has used the app for a while and answered a few times', () => {
    expect(reviewPromptDue(seasoned, NOW, REVIEW_MIN_ANSWERS)).toBe(true)
  })

  it('waits for the first fortnight, and for a few answers', () => {
    expect(reviewPromptDue({ firstSeenAt: NOW - (REVIEW_MIN_AGE_DAYS - 1) * DAY, askedCount: 0 }, NOW, 10)).toBe(false)
    expect(reviewPromptDue(seasoned, NOW, REVIEW_MIN_ANSWERS - 1)).toBe(false)
  })

  it('leaves months between two prompts', () => {
    const asked = { ...seasoned, askedCount: 1, lastAskedAt: NOW - (REVIEW_INTERVAL_DAYS - 1) * DAY }
    expect(reviewPromptDue(asked, NOW, 10)).toBe(false)
    expect(reviewPromptDue({ ...asked, lastAskedAt: NOW - REVIEW_INTERVAL_DAYS * DAY }, NOW, 10)).toBe(true)
  })

  it('stops after the cap, and for good once declined or reviewed', () => {
    expect(reviewPromptDue({ ...seasoned, askedCount: REVIEW_MAX_ASKS }, NOW, 10)).toBe(false)
    expect(reviewPromptDue({ ...seasoned, stopped: 'declined' }, NOW, 10)).toBe(false)
    expect(reviewPromptDue({ ...seasoned, stopped: 'reviewed' }, NOW, 10)).toBe(false)
  })
})

describe('applyReviewEvent', () => {
  it('counts a prompt, « Plus tard » included', () => {
    expect(applyReviewEvent(seasoned, 'asked', NOW)).toEqual({ ...seasoned, askedCount: 1, lastAskedAt: NOW })
  })

  it('stops on « Ne plus demander », and counts it as a prompt', () => {
    expect(applyReviewEvent(seasoned, 'declined', NOW)).toEqual({ ...seasoned, askedCount: 1, lastAskedAt: NOW, stopped: 'declined' })
  })

  it('does not count the row in Compte as a prompt', () => {
    expect(applyReviewEvent(seasoned, 'reviewed', NOW)).toEqual({ ...seasoned, stopped: 'reviewed' })
  })

  it('never lifts a stop, and lets « reviewed » outrank « declined »', () => {
    const declined = applyReviewEvent(seasoned, 'declined', NOW)
    expect(applyReviewEvent(declined, 'asked', NOW).stopped).toBe('declined')
    expect(applyReviewEvent(declined, 'reviewed', NOW).stopped).toBe('reviewed')
    expect(applyReviewEvent({ ...seasoned, stopped: 'reviewed' }, 'declined', NOW).stopped).toBe('reviewed')
  })
})

describe('mergeReviewPromptStates', () => {
  it('keeps the more cautious of two records on every count', () => {
    expect(mergeReviewPromptStates(
      { firstSeenAt: 5, askedCount: 1, lastAskedAt: 50 },
      { firstSeenAt: 3, askedCount: 2, lastAskedAt: 40, stopped: 'declined' },
    )).toEqual({ firstSeenAt: 3, askedCount: 2, lastAskedAt: 50, stopped: 'declined' })
    expect(mergeReviewPromptStates({ firstSeenAt: 1, askedCount: 0 }, { firstSeenAt: 2, askedCount: 0 }))
      .toEqual({ firstSeenAt: 1, askedCount: 0 })
  })
})
