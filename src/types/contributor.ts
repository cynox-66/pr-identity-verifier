/**
 * Core domain types for contributor identity verification
 *
 * These types model the data flowing through the verification pipeline:
 *   Contributor → DID Document → Verifiable Credential → Verification Result
 *
 * FUTURE: Align with W3C DID Core (https://www.w3.org/TR/did-core/)
 *         and W3C Verifiable Credentials Data Model (https://www.w3.org/TR/vc-data-model/)
 */

// ---------------------------------------------------------------------------
// Contributor
// ---------------------------------------------------------------------------

export interface Contributor {
  username: string;
  githubId: number;
  avatarUrl: string;

  /** Email from GitHub profile (may be null if private) */
  email: string | null;

  /**
   * Whether the HEAD commit on this PR has a verified GPG/SSH signature.
   * Populated from the GitHub API; null when we couldn't determine it.
   */
  gpgVerified: boolean | null;

  /**
   * Whether this contributor has a linked DID.
   * Set by the DID resolver during the pipeline run.
   */
  didLinked: boolean;

  /** Resolved DID URI, e.g. "did:web:example.com/users/alice" */
  did?: string;
}

// ---------------------------------------------------------------------------
// DID Document (mock, mirrors W3C DID Core structure)
// ---------------------------------------------------------------------------

export interface DIDDocument {
  /** The DID this document describes, e.g. "did:web:example.com/users/alice" */
  id: string;

  /** Public key entries — in production these hold real key material */
  publicKey: Array<{
    id: string;
    type: string;
    controller: string;
    /** Base58-encoded mock public key */
    publicKeyBase58: string;
  }>;

  /**
   * Verification methods — how to verify proofs created by this DID subject.
   * FUTURE: Replace with real Ed25519VerificationKey2020 or JsonWebKey2020.
   */
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
  }>;

  /** Optional service endpoints (e.g. a linked domain or credential endpoint) */
  service: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
}

// ---------------------------------------------------------------------------
// Verifiable Credential (mock, mirrors W3C VC Data Model)
// ---------------------------------------------------------------------------

export interface VerifiableCredential {
  /** Issuer DID */
  issuer: string;

  /** Subject DID (the contributor) */
  subject: string;

  /** Credential type — in production this maps to a JSON-LD @type */
  type: string;

  /** ISO-8601 timestamp of when the credential was issued */
  issuedAt: string;

  /** Whether this credential is still valid (not expired / not revoked) */
  valid: boolean;
}

// ---------------------------------------------------------------------------
// Verification Pipeline Result
// ---------------------------------------------------------------------------

/** Individual check outcomes from the pipeline */
export interface VerificationChecks {
  /** Did the DID resolver return a document for this contributor? */
  didResolved: boolean;

  /** Is the attached Verifiable Credential valid? */
  credentialValid: boolean;

  /** Is the credential's issuer on our trusted issuer list? */
  issuerTrusted: boolean;

  /** Did the contributor provide their own DID (in PR title or body)? */
  didProvided: boolean;
}

export interface VerificationResult {
  verified: boolean;
  score: number; // 0–100
  message: string;
  timestamp: string;

  /** Resolved DID URI */
  did: string;

  /**
   * Method used for verification.
   * "mock-did" for the simulated pipeline; will become "did-resolution"
   * or "vc-validation" when real infrastructure is wired in.
   */
  verificationMethod: string;

  /** Granular pass/fail for each pipeline stage */
  checks: VerificationChecks;
}

// ---------------------------------------------------------------------------
// Webhook Context
// ---------------------------------------------------------------------------

export interface PullRequestContext {
  prNumber: number;
  repoOwner: string;
  repoName: string;
  headSha: string;
  contributor: Contributor;
  prUrl: string;
}
