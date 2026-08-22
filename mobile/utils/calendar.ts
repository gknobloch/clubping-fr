// The event a match becomes lives in the shared lib (#426): the web builds the
// same one for its .ics, and one definition beats two that drift. Kept as a
// re-export so the screens keep their `@/utils/...` imports.
export { buildMatchEvent, parseGameTime, type MatchEvent } from '@shared/lib/calendar'
