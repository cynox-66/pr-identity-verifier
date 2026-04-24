/**
 * Concurrency Tests: Rapid Commits & Parallel Verification
 *
 * Tests that the verification pipeline handles concurrent scenarios correctly:
 *   - Multiple rapid commits on the same PR
 *   - Parallel verification of independent PRs
 *   - Replay registry consistency under concurrent access
 */

import { verifyPullRequest } from '../../src/services/verifier';
import { resolveDID, resolveDIDDocument, extractVerificationMethod } from '../../src/services/didResolver';
import { computeExpectedSignature, clearReplayRegistry } from '../../src/services/cryptoService';
import { CommitSignatureInfo, PullRequestContext } from '../../src/types/verification';

function makeContext(prNumber: number, username: string = 'alice'): PullRequestContext {
  return {
    prNumber,
    repoOwner: 'test-org',
    repoName: 'test-repo',
    headSha: prNumber.toString().padStart(40, '0'),
    prUrl: `https://github.com/test-org/test-repo/pull/${prNumber}`,
    prBody: null,
    prTitle: `PR #${prNumber}`,
    contributor: {
      username,
      githubId: 12345,
      avatarUrl: '',
      email: null,
    },
  };
}

function getPublicKey(username: string): string {
  const { did } = resolveDID(username);
  const { document } = resolveDIDDocument(did!);
  return extractVerificationMethod(document!)!.publicKeyBase58!;
}

function makeSignedCommit(sha: string, username: string = 'alice'): CommitSignatureInfo {
  const pubKey = getPublicKey(username);
  const sig = computeExpectedSignature(sha, pubKey);
  return {
    commitSha: sha,
    author: username,
    message: `commit by ${username}`,
    hasSignature: true,
    signaturePayload: sig,
  };
}

describe('Concurrency Tests', () => {
  beforeEach(() => {
    clearReplayRegistry();
  });

  it('should handle 20 rapid commits on a single PR', async () => {
    const ctx = makeContext(1);
    const commits = Array.from({ length: 20 }, (_, i) =>
      makeSignedCommit(i.toString(16).padStart(40, '0'))
    );

    const result = await verifyPullRequest(ctx, commits);

    expect(result.totalCommits).toBe(20);
    expect(result.passedCommits).toBe(20);
    expect(result.status).toBe('SUCCESS');
    expect(result.commitResults).toHaveLength(20);
  });

  it('should handle parallel verification of 5 independent PRs', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const ctx = makeContext(100 + i);
        const sha = (100 + i).toString(16).padStart(40, '0');
        const commits = [makeSignedCommit(sha)];
        return verifyPullRequest(ctx, commits);
      })
    );

    // All 5 PRs should succeed independently
    for (const result of results) {
      expect(result.status).toBe('SUCCESS');
      expect(result.passedCommits).toBe(1);
    }

    // Each should have a unique nonce
    const nonces = results.map((r) => r.verificationNonce);
    const uniqueNonces = new Set(nonces);
    expect(uniqueNonces.size).toBe(5);
  });

  it('should isolate verification state between different PRs', async () => {
    const ctx1 = makeContext(200, 'alice');
    const ctx2 = makeContext(201, 'bob');

    const aliceCommits = [makeSignedCommit('a'.repeat(40), 'alice')];
    const bobCommits = [makeSignedCommit('b'.repeat(40), 'bob')];

    const [r1, r2] = await Promise.all([
      verifyPullRequest(ctx1, aliceCommits),
      verifyPullRequest(ctx2, bobCommits),
    ]);

    expect(r1.status).toBe('SUCCESS');
    expect(r2.status).toBe('SUCCESS');
    expect(r1.did).not.toBe(r2.did);
  });

  it('should complete verification within 100ms for 50 commits', async () => {
    const ctx = makeContext(300);
    const commits = Array.from({ length: 50 }, (_, i) =>
      makeSignedCommit(i.toString(16).padStart(40, '0'))
    );

    const start = Date.now();
    const result = await verifyPullRequest(ctx, commits);
    const elapsed = Date.now() - start;

    expect(result.status).toBe('SUCCESS');
    expect(elapsed).toBeLessThan(100); // Should be fast
  });
});
