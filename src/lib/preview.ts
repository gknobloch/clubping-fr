/**
 * Build-time identity of a PR preview deployment.
 *
 * `PR_NUMBER` is injected by vite.config.ts from the environment, and only
 * preview.yml sets it — deploy.yml does not. So `IS_PR_PREVIEW` is false in
 * production and false in local dev, and true exactly on a pr-<N> deployment.
 *
 * It lives in its own module rather than being read inline so that both the
 * preview banner and the login page share one definition, and so tests can
 * mock it — `__PR_NUMBER__` is a compile-time substitution and cannot be
 * stubbed per test.
 */
export const PR_NUMBER = __PR_NUMBER__
export const COMMIT_SHA = __COMMIT_SHA__
export const IS_PR_PREVIEW = PR_NUMBER !== ''
