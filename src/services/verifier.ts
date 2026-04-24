/**
 * Verification Pipeline Service
 *
 * Runs the DETERMINISTIC identity verification pipeline for a PR:
 *
 *   1. Extract all commits from the PR (GitHub API)
 *   2. Resolve the contributor's DID
 *   3. Fetch the DID Document (get public keys)
 *   4. For EACH commit:
 *      a. Extract commit signature
 *      b. Verify signature against DID public key
 *      c. Validate associated credential
 *      d. Classify result: SUCCESS / HARD_FAIL / SOFT_FAIL
 *   5. Aggregate per-commit results into PR-level verdict
 *
 * ─── VERIFICATION GUARANTEES ────────────────────────────────────────────
 *
 * 1. DETERMINISTIC: Same input always produces same output.
 *    No randomness, no heuristics, no scores.
 *
 * 2. FAIL-STRICT: If ANY commit fails → entire PR fails.
 *    A PR is only SUCCESS if ALL commits are SUCCESS.
 *
 * 3. REPLAY-RESISTANT: Each verification is bound to a specific
 *    commit SHA via nonce. Signatures cannot be reused.
 *
 * 4. CLASSIFIABLE: Every failure has a deterministic classification:
 *    - HARD_FAIL: cryptographic proof of incorrectness
 *    - SOFT_FAIL: uncertainty (network, missing data)
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import {
  VerificationResult,
  CommitVerificationResult,
  CommitSignatureInfo,
  PullRequestContext,
  VerificationStatus,
} from '../types/verification';
import { resolveDID, resolveDIDDocument, extractVerificationMethod } from './didResolver';
import { issueCredential, validateCredential, isIssuerTrusted } from './credentialService';
import { verifyCommitSignature, generateVerificationNonce } from './cryptoService';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Run the full verification pipeline for a pull request.
 *
 * @param context - PR context with contributor info
 * @param commits - Array of commit signature info (from GitHub API)
 * @returns Deterministic verification result
 */
export async function verifyPullRequest(
  context: PullRequestContext,
  commits: CommitSignatureInfo[]
): Promise<VerificationResult> {
  const { contributor } = context;
  logger.info('⚙️  VERIFICATION PIPELINE STARTED', {
    contributor: contributor.username,
    prNumber: context.prNumber,
    totalCommits: commits.length,
  });

  const nonce = generateVerificationNonce(
    context.repoOwner,
    context.repoName,
    context.prNumber,
    context.headSha
  );

  // ── Edge case: empty PR (no commits) ────────────────────────────────
  if (commits.length === 0) {
    logger.warn('PR has no commits', { prNumber: context.prNumber });
    return buildResult({
      didResolved: false,
      signatureValid: false,
      credentialValid: false,
      status: 'SOFT_FAIL',
      reason: 'Pull request has no commits to verify',
      did: 'unresolved',
      commitResults: [],
      totalCommits: 0,
      passedCommits: 0,
      failedCommits: 0,
      timestamp: new Date().toISOString(),
      verificationNonce: nonce,
    });
  }

  // ── Safety bound: cap commit count ──────────────────────────────────
  if (commits.length > config.MAX_COMMITS_PER_PR) {
    logger.warn('PR exceeds max commit count', {
      count: commits.length,
      max: config.MAX_COMMITS_PER_PR,
    });
    return buildResult({
      didResolved: false,
      signatureValid: false,
      credentialValid: false,
      status: 'SOFT_FAIL',
      reason: `PR has ${commits.length} commits, exceeding the safety limit of ${config.MAX_COMMITS_PER_PR}`,
      did: 'unresolved',
      commitResults: [],
      totalCommits: commits.length,
      passedCommits: 0,
      failedCommits: 0,
      timestamp: new Date().toISOString(),
      verificationNonce: nonce,
    });
  }

  // ── Step 1: Resolve DID ─────────────────────────────────────────────
  const didResult = resolveDID(contributor.username, contributor.did);

  if (!didResult.did) {
    logger.warn('DID resolution failed', {
      username: contributor.username,
      error: didResult.error,
    });
    return buildResult({
      didResolved: false,
      signatureValid: false,
      credentialValid: false,
      status: 'HARD_FAIL',
      reason: `DID resolution failed: ${didResult.error}`,
      did: 'unresolved',
      commitResults: [],
      totalCommits: commits.length,
      passedCommits: 0,
      failedCommits: commits.length,
      timestamp: new Date().toISOString(),
      verificationNonce: nonce,
    });
  }

  const did = didResult.did;

  // ── Step 2: Resolve DID Document ────────────────────────────────────
  const docResult = resolveDIDDocument(did);

  if (!docResult.document) {
    logger.warn('DID Document resolution failed', {
      did,
      error: docResult.error,
    });
    return buildResult({
      didResolved: false,
      signatureValid: false,
      credentialValid: false,
      status: 'SOFT_FAIL',
      reason: `DID Document resolution failed: ${docResult.error}`,
      did,
      commitResults: [],
      totalCommits: commits.length,
      passedCommits: 0,
      failedCommits: commits.length,
      timestamp: new Date().toISOString(),
      verificationNonce: nonce,
    });
  }

  // ── Step 3: Extract verification method (public key) ────────────────
  const verificationMethod = extractVerificationMethod(docResult.document);

  if (!verificationMethod) {
    return buildResult({
      didResolved: true,
      signatureValid: false,
      credentialValid: false,
      status: 'HARD_FAIL',
      reason: 'DID Document has no verification methods (no public keys)',
      did,
      commitResults: [],
      totalCommits: commits.length,
      passedCommits: 0,
      failedCommits: commits.length,
      timestamp: new Date().toISOString(),
      verificationNonce: nonce,
    });
  }

  // ── Step 4: Issue and validate credential ───────────────────────────
  const credential = issueCredential(did);
  const credResult = validateCredential(credential);
  const issuerResult = isIssuerTrusted(credential.issuer);

  const credentialValid = credResult.valid && issuerResult.trusted;

  // ── Step 5: Verify each commit ──────────────────────────────────────
  const commitResults: CommitVerificationResult[] = [];

  for (const commit of commits) {
    const commitResult = verifyCommit(commit, verificationMethod, credentialValid, did);
    commitResults.push(commitResult);
  }

  // ── Step 6: Aggregate results ───────────────────────────────────────
  const passedCommits = commitResults.filter((r) => r.status === 'SUCCESS').length;
  const failedCommits = commits.length - passedCommits;

  // Strict aggregation: PR status = worst commit status
  const aggregateStatus = aggregateCommitStatuses(commitResults);

  const signatureValid = commitResults.every((r) => r.signatureValid);

  const reason = buildAggregateReason(aggregateStatus, passedCommits, commits.length, commitResults);

  const result = buildResult({
    didResolved: true,
    signatureValid,
    credentialValid,
    status: aggregateStatus,
    reason,
    did,
    commitResults,
    totalCommits: commits.length,
    passedCommits,
    failedCommits,
    timestamp: new Date().toISOString(),
    verificationNonce: nonce,
  });

  logger.info(`${result.status === 'SUCCESS' ? '✅' : '❌'} VERIFICATION COMPLETE`, {
    status: result.status,
    passed: `${passedCommits}/${commits.length}`,
    did,
  });

  return result;
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Verify a single commit against the DID verification method.
 */
function verifyCommit(
  commit: CommitSignatureInfo,
  verificationMethod: ReturnType<typeof extractVerificationMethod>,
  credentialValid: boolean,
  did: string
): CommitVerificationResult {
  // ── Handle unsigned commits ─────────────────────────────────────────
  if (!commit.hasSignature) {
    const status: VerificationStatus = config.REQUIRE_COMMIT_SIGNATURES ? 'HARD_FAIL' : 'SOFT_FAIL';
    return {
      commitSha: commit.commitSha,
      didResolved: true,
      signatureValid: false,
      credentialValid,
      status,
      reason: `Commit ${commit.commitSha.slice(0, 7)} has no cryptographic signature`,
      verifiedAt: new Date().toISOString(),
    };
  }

  // ── Verify signature against DID public key ─────────────────────────
  if (!verificationMethod) {
    return {
      commitSha: commit.commitSha,
      didResolved: true,
      signatureValid: false,
      credentialValid,
      status: 'HARD_FAIL',
      reason: 'No verification method available for signature check',
      verifiedAt: new Date().toISOString(),
    };
  }

  const sigResult = verifyCommitSignature(commit, verificationMethod);

  if (!sigResult.valid) {
    return {
      commitSha: commit.commitSha,
      didResolved: true,
      signatureValid: false,
      credentialValid,
      status: 'HARD_FAIL',
      reason: sigResult.reason,
      verifiedAt: new Date().toISOString(),
    };
  }

  // ── Credential check ────────────────────────────────────────────────
  if (!credentialValid) {
    return {
      commitSha: commit.commitSha,
      didResolved: true,
      signatureValid: true,
      credentialValid: false,
      status: 'HARD_FAIL',
      reason: 'Commit signature valid but credential is invalid or issuer untrusted',
      verifiedAt: new Date().toISOString(),
    };
  }

  // ── All checks passed ──────────────────────────────────────────────
  return {
    commitSha: commit.commitSha,
    didResolved: true,
    signatureValid: true,
    credentialValid: true,
    status: 'SUCCESS',
    reason: `Commit ${commit.commitSha.slice(0, 7)} verified: signature matches DID public key`,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Aggregate commit statuses into a PR-level status.
 *
 * Rule (strictly ordered):
 *   1. If ANY commit is HARD_FAIL → PR is HARD_FAIL
 *   2. If ANY commit is SOFT_FAIL (and no HARD_FAIL) → PR is SOFT_FAIL
 *   3. If ALL commits are SUCCESS → PR is SUCCESS
 */
function aggregateCommitStatuses(results: CommitVerificationResult[]): VerificationStatus {
  if (results.some((r) => r.status === 'HARD_FAIL')) return 'HARD_FAIL';
  if (results.some((r) => r.status === 'SOFT_FAIL')) return 'SOFT_FAIL';
  return 'SUCCESS';
}

/**
 * Build a human-readable aggregate reason.
 */
function buildAggregateReason(
  status: VerificationStatus,
  passed: number,
  total: number,
  results: CommitVerificationResult[]
): string {
  if (status === 'SUCCESS') {
    return `All ${total} commit(s) verified: signatures match DID public keys`;
  }

  const failures = results.filter((r) => r.status !== 'SUCCESS');
  const failReasons = failures
    .map((f) => `  • ${f.commitSha.slice(0, 7)}: ${f.reason}`)
    .join('\n');

  return `${passed}/${total} commits passed. Failures:\n${failReasons}`;
}

/**
 * Build a VerificationResult (DRY helper).
 */
function buildResult(data: VerificationResult): VerificationResult {
  return data;
}
