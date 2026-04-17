/**
 * Verification Pipeline Service
 *
 * Runs the full identity verification flow for a contributor:
 *   1. Resolve DID from GitHub username
 *   2. Fetch the mock DID Document
 *   3. Issue (or fetch) a mock Verifiable Credential
 *   4. Run three checks: DID resolved · credential valid · issuer trusted
 *   5. Compute a verification score and return a structured result
 *
 * Each step is logged so you can follow the pipeline in the console.
 *
 * ─── WHERE REAL LOGIC WILL GO ───────────────────────────────────────────
 *
 * Step 1 → Use a universal DID resolver (did:webvh, did:key, did:ion)
 * Step 2 → Validate the DID Document cryptographic material
 * Step 3 → Request a Verifiable Presentation via OID4VP / DIDComm
 * Step 4 → Verify VC proofs, check revocation, apply trust policies
 * Step 5 → Incorporate reputation signals (commit history, org membership, etc.)
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import { Contributor, VerificationResult, VerificationChecks } from '../types/contributor';
import { resolveDID, getDIDDocument } from './didService';
import { issueCredential, validateCredential, isIssuerTrusted } from './credentialService';
import { config } from '../config';
import { logger } from '../utils/logger';

// ── Score weights ────────────────────────────────────────────────────────
// Each check contributes a fixed amount to the total score (out of 100).
// didProvided rewards contributors who supply their own DID — this signals
// a higher level of identity readiness.
// In a real system these weights would be configurable per-organization.
const SCORE_WEIGHTS = {
  didResolved: 30,
  credentialValid: 30,
  issuerTrusted: 20,
  didProvided: 20,
} as const;

/**
 * Run the full verification pipeline for a single contributor.
 */
export async function verifyContributor(contributor: Contributor): Promise<VerificationResult> {
  logger.info('⚙️  VERIFICATION STARTED', { contributor: contributor.username });

  try {
    // ── Step 1: Resolve DID ──────────────────────────────────────────────
    // Pass the contributor-provided DID (if any) so resolveDID can use it
    // instead of generating a mock. This is the key integration point for
    // contributor-supplied decentralized identifiers.
    const didProvided = Boolean(contributor.did);
    const did = resolveDID(contributor.username, contributor.did);
    const didResolved = Boolean(did);

    // ── Step 2: Fetch DID Document ───────────────────────────────────────
    const didDocument = getDIDDocument(did);

    // ── Step 3: Issue / fetch mock credential ────────────────────────────
    const credential = issueCredential(did);

    // ── Step 4: Run verification checks ──────────────────────────────────
    const credentialValid = validateCredential(credential);
    const issuerTrusted = isIssuerTrusted(credential.issuer);

    const checks: VerificationChecks = {
      didResolved,
      credentialValid,
      issuerTrusted,
      didProvided,
    };

    // ── Step 5: Compute score ────────────────────────────────────────────
    let score = 0;
    if (checks.didResolved) score += SCORE_WEIGHTS.didResolved;
    if (checks.credentialValid) score += SCORE_WEIGHTS.credentialValid;
    if (checks.issuerTrusted) score += SCORE_WEIGHTS.issuerTrusted;
    if (checks.didProvided) score += SCORE_WEIGHTS.didProvided;

    const verified = score >= config.MIN_VERIFICATION_SCORE;

    const message = verified
      ? `Contributor @${contributor.username} passed identity verification.`
      : `Contributor @${contributor.username} did not meet verification threshold (score ${score}/${config.MIN_VERIFICATION_SCORE} required).`;

    const result: VerificationResult = {
      verified,
      score,
      did,
      verificationMethod: didProvided ? 'contributor-did' : 'mock-did',
      checks,
      message,
      timestamp: new Date().toISOString(),
    };

    logger.info(`${result.verified ? '✅' : '❌'} VERIFICATION COMPLETE`, {
      score: `${result.score}/100`,
      verified: result.verified,
      did,
    });

    return result;
  } catch (error) {
    logger.error('Verification pipeline error', {
      username: contributor.username,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return a graceful failure instead of throwing — the webhook should
    // always ACK even if verification encounters an internal error.
    return {
      verified: false,
      score: 0,
      did: 'unresolved',
      verificationMethod: 'error',
      checks: {
        didResolved: false,
        credentialValid: false,
        issuerTrusted: false,
        didProvided: false,
      },
      message: `Verification error for @${contributor.username}. Please try again later.`,
      timestamp: new Date().toISOString(),
    };
  }
}
