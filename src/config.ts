/**
 * Application Configuration
 *
 * Central config for the identity verification system.
 * All values have sensible defaults and can be overridden via environment variables.
 *
 * NOTE: Scoring-related config has been removed. The system uses deterministic
 * verification (SUCCESS / HARD_FAIL / SOFT_FAIL) instead of heuristic scores.
 */

import { VerificationMode } from './crypto/types';

/**
 * Parse and validate the VERIFICATION_MODE environment variable.
 */
function parseVerificationMode(): VerificationMode {
  const mode = process.env.VERIFICATION_MODE;
  if (mode === 'real_crypto') return 'real_crypto';
  return 'simulated';
}

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

  // ── Verification Mode ────────────────────────────────────────────────

  /**
   * Crypto verification mode:
   *   'simulated'  — SHA-256 hash comparison (default, deterministic)
   *   'real_crypto' — Real Ed25519 via @noble/ed25519
   */
  VERIFICATION_MODE: parseVerificationMode(),

  // ── Security Tuning ──────────────────────────────────────────────────

  /**
   * Maximum entries in the replay protection registry before eviction.
   * Prevents unbounded memory growth in long-running processes.
   */
  REPLAY_REGISTRY_MAX_SIZE: parseInt(process.env.REPLAY_REGISTRY_MAX_SIZE || '10000', 10),

  /**
   * TTL for replay registry entries in milliseconds.
   * Entries older than this are eligible for eviction. Default: 1 hour.
   */
  REPLAY_REGISTRY_TTL_MS: parseInt(process.env.REPLAY_REGISTRY_TTL_MS || '3600000', 10),

  /**
   * TTL for DID Document cache entries in milliseconds.
   * Default: 5 minutes. In production, Hedera HCS resolution is expensive
   * and DID Documents change infrequently.
   */
  DID_CACHE_TTL_MS: parseInt(process.env.DID_CACHE_TTL_MS || '300000', 10),

  /**
   * Maximum entries in the DID Document cache.
   */
  DID_CACHE_MAX_SIZE: parseInt(process.env.DID_CACHE_MAX_SIZE || '1000', 10),
} as const;
