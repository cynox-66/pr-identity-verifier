/**
 * Integration Tests: Verification Pipeline
 *
 * Tests the full pipeline: DID resolution → signature verification → result.
 * These tests exercise the complete code path that a real webhook would trigger,
 * using mock commit data instead of real GitHub API calls.
 */

import { verifyPullRequest } from '../../src/services/verifier';
import { resolveDID, resolveDIDDocument, extractVerificationMethod } from '../../src/services/didResolver';
import { computeExpectedSignature, clearReplayRegistry } from '../../src/services/cryptoService';
import { CommitSignatureInfo, PullRequestContext } from '../../src/types/verification';

// ── Test helpers ──────────────────────────────────────────────────────────

function makeContext(overrides: Partial<PullRequestContext> = {}): PullRequestContext {
  return {
    prNumber: 42,
    repoOwner: 'test-org',
    repoName: 'test-repo',
    headSha: 'abc123def456789012345678901234567890abcd',
    prUrl: 'https://github.com/test-org/test-repo/pull/42',
    prBody: null,
    prTitle: 'Test PR',
    contributor: {
      username: 'alice',
      githubId: 12345,
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      email: null,
    },
    ...overrides,
  };
}

function makeSignedCommit(
  sha: string,
  publicKeyBase58: string,
  author: string = 'alice'
): CommitSignatureInfo {
  const sig = computeExpectedSignature(sha, publicKeyBase58);
  return {
    commitSha: sha,
    author,
    message: `commit by ${author}`,
    hasSignature: true,
    signaturePayload: sig,
  };
}

function makeUnsignedCommit(sha: string, author: string = 'alice'): CommitSignatureInfo {
  return {
    commitSha: sha,
    author,
    message: `unsigned commit by ${author}`,
    hasSignature: false,
  };
}

function getPublicKey(username: string): string {
  const { did } = resolveDID(username);
  const { document } = resolveDIDDocument(did!);
  return extractVerificationMethod(document!)!.publicKeyBase58!;
}

describe('Verification Pipeline (Integration)', () => {
  beforeEach(() => {
    clearReplayRegistry();
  });

  // ── SUCCESS cases ─────────────────────────────────────────────────────

  describe('SUCCESS path', () => {
    it('should SUCCEED for single signed commit with matching DID', async () => {
      const ctx = makeContext();
      const pubKey = getPublicKey('alice');
      const commits = [makeSignedCommit('a'.repeat(40), pubKey)];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.status).toBe('SUCCESS');
      expect(result.didResolved).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.credentialValid).toBe(true);
      expect(result.totalCommits).toBe(1);
      expect(result.passedCommits).toBe(1);
      expect(result.failedCommits).toBe(0);
    });

    it('should SUCCEED for multiple signed commits', async () => {
      const ctx = makeContext();
      const pubKey = getPublicKey('alice');
      const commits = [
        makeSignedCommit('a'.repeat(40), pubKey),
        makeSignedCommit('b'.repeat(40), pubKey),
        makeSignedCommit('c'.repeat(40), pubKey),
      ];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.status).toBe('SUCCESS');
      expect(result.totalCommits).toBe(3);
      expect(result.passedCommits).toBe(3);
    });

    it('should include per-commit results', async () => {
      const ctx = makeContext();
      const pubKey = getPublicKey('alice');
      const commits = [
        makeSignedCommit('a'.repeat(40), pubKey),
        makeSignedCommit('b'.repeat(40), pubKey),
      ];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.commitResults).toHaveLength(2);
      expect(result.commitResults[0].commitSha).toBe('a'.repeat(40));
      expect(result.commitResults[0].status).toBe('SUCCESS');
      expect(result.commitResults[1].commitSha).toBe('b'.repeat(40));
      expect(result.commitResults[1].status).toBe('SUCCESS');
    });

    it('should include verification nonce', async () => {
      const ctx = makeContext();
      const pubKey = getPublicKey('alice');
      const commits = [makeSignedCommit('a'.repeat(40), pubKey)];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.verificationNonce).toBeDefined();
      expect(result.verificationNonce.length).toBe(32);
    });
  });

  // ── HARD_FAIL cases ────────────────────────────────────────────────────

  describe('HARD_FAIL path', () => {
    it('should HARD_FAIL when signature does not match DID', async () => {
      const ctx = makeContext();
      // Sign with alice's key but use bob's DID
      const bobPublicKey = getPublicKey('bob');
      const commits = [makeSignedCommit('a'.repeat(40), bobPublicKey)];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.status).toBe('HARD_FAIL');
      expect(result.signatureValid).toBe(false);
      expect(result.commitResults[0].status).toBe('HARD_FAIL');
    });

    it('should HARD_FAIL for invalid contributor DID', async () => {
      const ctx = makeContext({
        contributor: {
          username: 'alice',
          githubId: 12345,
          avatarUrl: '',
          email: null,
          did: 'not-a-valid-did',
        },
      });

      const result = await verifyPullRequest(ctx, [makeUnsignedCommit('a'.repeat(40))]);

      expect(result.status).toBe('HARD_FAIL');
      expect(result.didResolved).toBe(false);
    });

    it('should HARD_FAIL the entire PR if ANY commit fails', async () => {
      const ctx = makeContext();
      const pubKey = getPublicKey('alice');
      const wrongKey = getPublicKey('bob');

      const commits = [
        makeSignedCommit('a'.repeat(40), pubKey),    // valid
        makeSignedCommit('b'.repeat(40), wrongKey),  // INVALID
        makeSignedCommit('c'.repeat(40), pubKey),    // valid
      ];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.status).toBe('HARD_FAIL');
      expect(result.passedCommits).toBe(2);
      expect(result.failedCommits).toBe(1);
      expect(result.commitResults[1].status).toBe('HARD_FAIL');
    });
  });

  // ── SOFT_FAIL cases ───────────────────────────────────────────────────

  describe('SOFT_FAIL path', () => {
    it('should SOFT_FAIL for empty PR (no commits)', async () => {
      const ctx = makeContext();
      const result = await verifyPullRequest(ctx, []);

      expect(result.status).toBe('SOFT_FAIL');
      expect(result.totalCommits).toBe(0);
    });

    it('should SOFT_FAIL for unsigned commits (when signatures not required)', async () => {
      const ctx = makeContext();
      const commits = [makeUnsignedCommit('a'.repeat(40))];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.status).toBe('SOFT_FAIL');
      expect(result.commitResults[0].signatureValid).toBe(false);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle contributor-provided DID', async () => {
      const ctx = makeContext({
        contributor: {
          username: 'alice',
          githubId: 12345,
          avatarUrl: '',
          email: null,
          did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        },
      });

      // Get the public key for the contributor-provided DID
      const { document } = resolveDIDDocument('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
      const pubKey = extractVerificationMethod(document!)!.publicKeyBase58!;
      const commits = [makeSignedCommit('a'.repeat(40), pubKey)];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.did).toBe('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
      expect(result.status).toBe('SUCCESS');
    });

    it('should handle mixed signed/unsigned commits', async () => {
      const ctx = makeContext();
      const pubKey = getPublicKey('alice');

      const commits = [
        makeSignedCommit('a'.repeat(40), pubKey),
        makeUnsignedCommit('b'.repeat(40)),
      ];

      const result = await verifyPullRequest(ctx, commits);

      // Unsigned commit = SOFT_FAIL (when signatures not required)
      expect(result.status).not.toBe('SUCCESS');
      expect(result.commitResults[0].status).toBe('SUCCESS');
      expect(result.commitResults[1].status).toBe('SOFT_FAIL');
    });

    it('should handle PR exceeding max commit count', async () => {
      const ctx = makeContext();
      const commits = Array.from({ length: 251 }, (_, i) =>
        makeUnsignedCommit(i.toString().padStart(40, '0'))
      );

      const result = await verifyPullRequest(ctx, commits);

      expect(result.status).toBe('SOFT_FAIL');
      expect(result.reason).toContain('safety limit');
    });

    it('should handle multiple authors across commits', async () => {
      const ctx = makeContext();
      const pubKey = getPublicKey('alice');

      const commits = [
        makeSignedCommit('a'.repeat(40), pubKey, 'alice'),
        makeSignedCommit('b'.repeat(40), pubKey, 'bob'),  // Different author
      ];

      const result = await verifyPullRequest(ctx, commits);

      // Both signed with alice's key — both should pass against alice's DID
      expect(result.status).toBe('SUCCESS');
    });
  });
});
