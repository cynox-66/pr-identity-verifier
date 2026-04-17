/**
 * Application Configuration
 *
 * Central config for the identity verification system.
 * All values have sensible defaults and can be overridden via environment variables.
 *
 * FUTURE: Replace static config with a policy engine that fetches
 * trust policies from a governance framework (e.g., Trust over IP).
 */

export const config = {
  /** Minimum score (0-100) a contributor must reach to pass verification */
  MIN_VERIFICATION_SCORE: parseInt(process.env.MIN_VERIFICATION_SCORE || '60', 10),

  /** When true, create a GitHub Check Run with structured output on each PR */
  ENABLE_CHECK_RUNS: process.env.ENABLE_CHECK_RUNS !== 'false', // default: true

  /** When true, post a legacy PR comment alongside (or instead of) the check run */
  ENABLE_PR_COMMENTS: process.env.ENABLE_PR_COMMENTS === 'true', // default: false

  /** Base domain used when minting mock did:web identifiers */
  DID_DOMAIN: process.env.DID_DOMAIN || 'example.com',

  /** Mock issuer DID — the entity that "signs" simulated credentials */
  CREDENTIAL_ISSUER: process.env.CREDENTIAL_ISSUER || 'did:web:issuer.example',

  /**
   * List of issuer DIDs this system trusts.
   * In production this would come from a Trust Registry or governance framework.
   */
  TRUSTED_ISSUERS: (process.env.TRUSTED_ISSUERS || 'did:web:issuer.example').split(','),
} as const;
