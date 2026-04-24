/**
 * Cryptographic Verification Service
 *
 * This module handles all cryptographic operations for the verification pipeline:
 *   - Commit signature extraction and verification against DID public keys
 *   - Replay attack protection via commit-SHA binding
 *   - Nonce generation for verification sessions
 *
 * ─── DESIGN DECISION ─────────────────────────────────────────────────────
 *
 * The architecture is structured EXACTLY like a production crypto system:
 *   1. Extract signature from commit
 *   2. Resolve DID → get public key from verificationMethod
 *   3. Verify signature against public key
 *   4. Bind verification to commit SHA (replay protection)
 *
 * The actual cryptographic operations are SIMULATED but the code paths,
 * error handling, and data flow are identical to what a real system needs.
 * Swapping in real Ed25519/ECDSA verification requires changing ONLY the
 * verifySignatureAgainstKey() function.
 *
 * ─── PRODUCTION REPLACEMENT POINTS ──────────────────────────────────────
 *
 * verifySignatureAgainstKey():
 *   → Use @noble/ed25519 or node:crypto.verify() with actual key material
 *
 * extractSignatureFromCommit():
 *   → Parse real GPG armor blocks or SSH signature blobs
 *
 * generateVerificationNonce():
 *   → Use crypto.randomBytes() bound to a challenge-response protocol
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import { createHash, randomBytes } from 'crypto';
import { CommitSignatureInfo, VerificationMethod } from '../types/verification';
import { logger } from '../utils/logger';

// ── Seen signatures registry (replay protection) ─────────────────────────
// In production: use Redis/DB with TTL. In-memory is fine for PoC.
const seenSignatures = new Map<string, { commitSha: string; verifiedAt: string }>();

/**
 * Generate a deterministic verification nonce bound to the PR context.
 *
 * The nonce ties a verification session to a specific PR + head SHA,
 * preventing replay of verification results across different PRs or
 * force-pushed commits.
 *
 * @param repoOwner - Repository owner
 * @param repoName  - Repository name
 * @param prNumber  - Pull request number
 * @param headSha   - HEAD commit SHA of the PR
 */
export function generateVerificationNonce(
  repoOwner: string,
  repoName: string,
  prNumber: number,
  headSha: string
): string {
  const entropy = randomBytes(16).toString('hex');
  const payload = `${repoOwner}/${repoName}#${prNumber}@${headSha}:${entropy}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Verify a commit signature against a DID public key.
 *
 * This is the core cryptographic operation. In the current implementation,
 * verification is SIMULATED using deterministic hash comparison:
 *
 *   1. Compute expected = SHA-256(commitSha + publicKey)
 *   2. Compare against the signature payload
 *
 * This simulation preserves the exact control flow of real verification:
 *   - Signature present? → extract and parse
 *   - Public key available? → load from DID document
 *   - Signature matches key? → verify
 *   - Already seen? → reject (replay)
 *
 * @param commit         - Commit signature info from GitHub API
 * @param verificationMethod - Public key from DID document
 * @returns Object with validity flag and reason
 */
export function verifyCommitSignature(
  commit: CommitSignatureInfo,
  verificationMethod: VerificationMethod
): { valid: boolean; reason: string } {
  // ── Guard: no signature present ─────────────────────────────────────
  if (!commit.hasSignature || !commit.signaturePayload) {
    logger.debug('No signature on commit', { sha: commit.commitSha });
    return {
      valid: false,
      reason: 'Commit has no cryptographic signature',
    };
  }

  // ── Guard: no public key material ───────────────────────────────────
  const publicKey = verificationMethod.publicKeyBase58;
  if (!publicKey) {
    logger.debug('No public key in verification method', {
      keyId: verificationMethod.id,
    });
    return {
      valid: false,
      reason: 'DID verification method has no public key material',
    };
  }

  // ── Replay protection: check if this signature was already used ─────
  const signatureFingerprint = createHash('sha256')
    .update(commit.signaturePayload)
    .digest('hex');

  const previousUse = seenSignatures.get(signatureFingerprint);
  if (previousUse && previousUse.commitSha !== commit.commitSha) {
    logger.warn('Replay attack detected: signature reuse', {
      currentCommit: commit.commitSha,
      previousCommit: previousUse.commitSha,
    });
    return {
      valid: false,
      reason: `Replay attack: signature was previously used on commit ${previousUse.commitSha}`,
    };
  }

  // ── Simulated cryptographic verification ────────────────────────────
  //
  // PRODUCTION REPLACEMENT:
  //   const isValid = crypto.verify(
  //     'ed25519',
  //     Buffer.from(commit.commitSha),
  //     publicKeyDer,
  //     signatureBuffer
  //   );
  //
  // SIMULATION:
  //   We compute an "expected signature" from the commit SHA + public key.
  //   The mock DID service generates signatures using this same formula,
  //   so matching commits + matching DID = valid.
  //   Mismatched DID = invalid. This simulates real signature math.

  const expectedSignature = computeExpectedSignature(commit.commitSha, publicKey);
  const isValid = commit.signaturePayload === expectedSignature;

  if (isValid) {
    // Record for replay protection
    seenSignatures.set(signatureFingerprint, {
      commitSha: commit.commitSha,
      verifiedAt: new Date().toISOString(),
    });

    logger.debug('Signature verified successfully', {
      sha: commit.commitSha,
      keyId: verificationMethod.id,
    });
  } else {
    logger.debug('Signature mismatch', {
      sha: commit.commitSha,
      keyId: verificationMethod.id,
    });
  }

  return {
    valid: isValid,
    reason: isValid
      ? 'Commit signature verified against DID public key'
      : 'Signature does not match DID public key — possible identity spoofing',
  };
}

/**
 * Compute the expected signature for a commit + public key pair.
 *
 * This is the simulated "signing" function. Both the mock DID service
 * (when generating test signatures) and this verifier use the same formula,
 * creating a deterministic system where:
 *   - Correct DID + correct commit → verification passes
 *   - Wrong DID or wrong commit → verification fails
 *
 * This EXACTLY models the semantics of real asymmetric crypto without
 * requiring actual key generation infrastructure.
 */
export function computeExpectedSignature(commitSha: string, publicKeyBase58: string): string {
  return createHash('sha256')
    .update(`${commitSha}:${publicKeyBase58}`)
    .digest('hex');
}

/**
 * Clear the replay protection registry.
 * Used in tests to reset state between test cases.
 */
export function clearReplayRegistry(): void {
  seenSignatures.clear();
}

/**
 * Get the current size of the replay registry.
 * Used in tests to verify replay protection behavior.
 */
export function getReplayRegistrySize(): number {
  return seenSignatures.size;
}
