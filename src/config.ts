/**
 * Application Configuration
 *
 * Central config for the identity verification system.
 * All values have sensible defaults and can be overridden via environment variables.
 *
 * NOTE: Scoring-related config has been removed. The system uses deterministic
 * verification (SUCCESS / HARD_FAIL / SOFT_FAIL) instead of heuristic scores.
 */

export const config = {
  /** When true, create a GitHub Check Run with structured output on each PR */
  ENABLE_CHECK_RUNS: process.env.ENABLE_CHECK_RUNS !== 'false',

  /** When true, post a PR comment alongside (or instead of) the check run */
  ENABLE_PR_COMMENTS: process.env.ENABLE_PR_COMMENTS === 'true',

  /** Base domain used when minting mock did:web identifiers */
  DID_DOMAIN: process.env.DID_DOMAIN || 'example.com',

  /** Mock issuer DID — the entity that "signs" simulated credentials */
  CREDENTIAL_ISSUER: process.env.CREDENTIAL_ISSUER || 'did:web:issuer.example',

  /**
   * List of issuer DIDs this system trusts.
   * In production this would come from a Trust Registry or governance framework.
   */
  TRUSTED_ISSUERS: (process.env.TRUSTED_ISSUERS || 'did:web:issuer.example').split(','),

  /**
   * Whether to require all commits to have cryptographic signatures.
   * When false, unsigned commits result in SOFT_FAIL instead of HARD_FAIL.
   */
  REQUIRE_COMMIT_SIGNATURES: process.env.REQUIRE_COMMIT_SIGNATURES === 'true',

  /**
   * Maximum number of commits to verify per PR.
   * Safety bound to prevent abuse on PRs with thousands of commits.
   */
  MAX_COMMITS_PER_PR: parseInt(process.env.MAX_COMMITS_PER_PR || '250', 10),
} as const;
