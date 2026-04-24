/**
 * Verification Pipeline Types
 *
 * These types define the data contracts for the deterministic identity
 * verification pipeline. Every type is designed for:
 *   - Strict failure classification (no ambiguity)
 *   - Per-commit granularity (multi-commit PRs)
 *   - Replay attack binding (commit SHA → verification)
 *   - Drop-in replaceability (mock → real crypto)
 *
 * References:
 *   - W3C DID Core: https://www.w3.org/TR/did-core/
 *   - W3C VC Data Model: https://www.w3.org/TR/vc-data-model/
 */

// ─────────────────────────────────────────────────────────────────────────────
// Failure Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic verification status.
 *
 * SUCCESS   — all checks passed; cryptographic proof of identity.
 * HARD_FAIL — signature mismatch, DID invalid, credential forged.
 *             System is CERTAIN the identity claim is incorrect.
 * SOFT_FAIL — resolver unavailable, network error, missing data.
 *             System CANNOT determine identity; requires human review.
 */
export type VerificationStatus = 'SUCCESS' | 'HARD_FAIL' | 'SOFT_FAIL';

// ─────────────────────────────────────────────────────────────────────────────
// DID Document (W3C DID Core aligned)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerificationMethod {
  /** Unique ID for this key, e.g. "did:web:example.com:users:alice#key-1" */
  id: string;

  /** Key type, e.g. "Ed25519VerificationKey2020", "JsonWebKey2020" */
  type: string;

  /** DID that controls this key */
  controller: string;

  /**
   * Public key material.
   * In production: real Ed25519/P-256 key bytes (base58 or JWK).
   * In mock: deterministic placeholder derived from DID subject.
   */
  publicKeyBase58?: string;
  publicKeyJwk?: Record<string, string>;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DIDDocument {
  /** The DID this document describes */
  id: string;

  /** Verification methods — public keys for signature verification */
  verificationMethod: VerificationMethod[];

  /** Authentication methods — keys authorized for this DID subject */
  authentication?: string[];

  /** Service endpoints — linked profiles, credential APIs, etc. */
  service?: ServiceEndpoint[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Verifiable Credential (W3C VC Data Model aligned)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifiableCredential {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;
    [key: string]: unknown;
  };
  proof?: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    /** Simulated signature bytes (hex string) */
    proofValue: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit-Level Verification
// ─────────────────────────────────────────────────────────────────────────────

export interface CommitSignatureInfo {
  /** Commit SHA this verification is bound to (replay protection) */
  commitSha: string;

  /** Commit author login */
  author: string;

  /** Commit message (first line) */
  message: string;

  /** Whether a cryptographic signature was present on the commit */
  hasSignature: boolean;

  /** Raw signature data if available (GPG armor or SSH blob) */
  signaturePayload?: string;

  /** Signature verification reason from GitHub API */
  verificationReason?: string;

  /** Whether GitHub itself verified this signature */
  githubVerified?: boolean;
}

export interface CommitVerificationResult {
  /** The commit this result is bound to */
  commitSha: string;

  /** Whether the DID was successfully resolved */
  didResolved: boolean;

  /** Whether the commit signature was verified against DID public key */
  signatureValid: boolean;

  /** Whether the associated credential is valid */
  credentialValid: boolean;

  /** Deterministic status for this commit */
  status: VerificationStatus;

  /** Human-readable reason for the status */
  reason: string;

  /** Timestamp when verification was performed (ISO-8601) */
  verifiedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PR-Level Verification (aggregate)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerificationResult {
  /** Aggregate: did the DID resolver return a valid document? */
  didResolved: boolean;

  /** Aggregate: were ALL commit signatures valid against DID keys? */
  signatureValid: boolean;

  /** Aggregate: was the associated credential valid? */
  credentialValid: boolean;

  /**
   * Aggregate status — determined by strictest rule:
   *   If ANY commit is HARD_FAIL → PR is HARD_FAIL
   *   If ANY commit is SOFT_FAIL (and none HARD_FAIL) → PR is SOFT_FAIL
   *   If ALL commits are SUCCESS → PR is SUCCESS
   */
  status: VerificationStatus;

  /** Human-readable reason for the PR-level status */
  reason: string;

  /** Resolved DID URI */
  did: string;

  /** Per-commit verification results */
  commitResults: CommitVerificationResult[];

  /** Total commits in PR */
  totalCommits: number;

  /** Count of commits that passed */
  passedCommits: number;

  /** Count of commits that failed */
  failedCommits: number;

  /** Timestamp when verification was performed (ISO-8601) */
  timestamp: string;

  /** Nonce used for replay protection (bound to PR + head SHA) */
  verificationNonce: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Context
// ─────────────────────────────────────────────────────────────────────────────

export interface Contributor {
  username: string;
  githubId: number;
  avatarUrl: string;
  email: string | null;

  /** DID extracted from PR body/title (contributor-provided) */
  did?: string;
}

export interface PullRequestContext {
  prNumber: number;
  repoOwner: string;
  repoName: string;
  headSha: string;
  contributor: Contributor;
  prUrl: string;
  prBody: string | null;
  prTitle: string;
}
