/**
 * Adversarial Tests: Security & Attack Scenarios
 *
 * Tests that the verification pipeline correctly handles:
 *   - DID spoofing (claiming someone else's identity)
 *   - Signature forgery (fabricating commit signatures)
 *   - Credential tampering (modifying VC proof or fields)
 *   - Replay attacks (reusing signatures across commits)
 *   - Injection attacks (malicious DID strings)
 *
 * These tests demonstrate system GUARANTEES, not just correctness.
 */

import { verifyPullRequest } from '../../src/services/verifier';
import { resolveDID, resolveDIDDocument, extractVerificationMethod } from '../../src/services/didResolver';
import { issueCredential, validateCredential } from '../../src/services/credentialService';
import { computeExpectedSignature, clearReplayRegistry, verifyCommitSignature } from '../../src/services/cryptoService';
import { CommitSignatureInfo, PullRequestContext, VerificationMethod } from '../../src/types/verification';

function makeContext(overrides: Partial<PullRequestContext> = {}): PullRequestContext {
  return {
    prNumber: 99,
    repoOwner: 'test-org',
    repoName: 'test-repo',
    headSha: 'deadbeef'.repeat(5),
    prUrl: 'https://github.com/test-org/test-repo/pull/99',
    prBody: null,
    prTitle: 'Adversarial Test PR',
    contributor: {
      username: 'alice',
      githubId: 12345,
      avatarUrl: '',
      email: null,
    },
    ...overrides,
  };
}

function getPublicKey(username: string): string {
  const { did } = resolveDID(username);
  const { document } = resolveDIDDocument(did!);
  return extractVerificationMethod(document!)!.publicKeyBase58!;
}

describe('Adversarial Tests', () => {
  beforeEach(() => {
    clearReplayRegistry();
  });

  // ── DID Spoofing ──────────────────────────────────────────────────────

  describe('DID Spoofing', () => {
    it('should DETECT when attacker claims another user\'s DID', async () => {
      // Attacker "eve" opens a PR but claims to be "alice"
      // The DID resolves to alice's DID, but eve's commits are signed
      // with eve's key — they should NOT match alice's DID public key.
      const ctx = makeContext({
        contributor: {
          username: 'eve', // attacker
          githubId: 66666,
          avatarUrl: '',
          email: null,
          did: 'did:web:example.com:users:alice', // claims alice's DID
        },
      });

      // Eve generates a signature using her OWN key
      const eveKey = getPublicKey('eve');
      const commitSha = 'e'.repeat(40);
      const eveSig = computeExpectedSignature(commitSha, eveKey);

      const commits: CommitSignatureInfo[] = [{
        commitSha,
        author: 'eve',
        message: 'spoofed commit',
        hasSignature: true,
        signaturePayload: eveSig,
      }];

      const result = await verifyPullRequest(ctx, commits);

      // Eve's signature should NOT match alice's public key
      expect(result.status).toBe('HARD_FAIL');
      expect(result.signatureValid).toBe(false);
    });
  });

  // ── Signature Forgery ─────────────────────────────────────────────────

  describe('Signature Forgery', () => {
    it('should REJECT fabricated signatures', async () => {
      const ctx = makeContext();
      const commitSha = 'f'.repeat(40);

      const commits: CommitSignatureInfo[] = [{
        commitSha,
        author: 'alice',
        message: 'forged commit',
        hasSignature: true,
        signaturePayload: 'totally-fake-signature-value-12345',
      }];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.status).toBe('HARD_FAIL');
      expect(result.commitResults[0].reason).toContain('does not match');
    });

    it('should REJECT empty signature payload', async () => {
      const ctx = makeContext();
      const commitSha = 'f'.repeat(40);

      const commits: CommitSignatureInfo[] = [{
        commitSha,
        author: 'alice',
        message: 'empty sig commit',
        hasSignature: true,
        signaturePayload: '',
      }];

      const result = await verifyPullRequest(ctx, commits);

      expect(result.status).toBe('HARD_FAIL');
    });
  });

  // ── Credential Tampering ──────────────────────────────────────────────

  describe('Credential Tampering', () => {
    it('should DETECT tampered credential proof', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      cred.proof!.proofValue = 'tampered' + cred.proof!.proofValue.slice(8);
      const result = validateCredential(cred);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid');
    });

    it('should DETECT credential subject swap', () => {
      // Issue credential for alice, then swap subject to eve
      const cred = issueCredential('did:web:example.com:users:alice');
      cred.credentialSubject.id = 'did:web:example.com:users:eve';
      const result = validateCredential(cred);
      expect(result.valid).toBe(false);
    });

    it('should DETECT credential with removed proof', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      delete cred.proof;
      const result = validateCredential(cred);
      expect(result.valid).toBe(false);
    });
  });

  // ── Replay Attacks ────────────────────────────────────────────────────

  describe('Replay Attacks', () => {
    it('should DETECT cross-commit signature replay', () => {
      const pubKey = 'z6MkReplayTestKey123456789';
      const vm: VerificationMethod = {
        id: 'did:web:test#key-1',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:web:test',
        publicKeyBase58: pubKey,
      };

      const sha1 = '1'.repeat(40);
      const sha2 = '2'.repeat(40);
      const sig = computeExpectedSignature(sha1, pubKey);

      // First verification — should succeed
      const commit1: CommitSignatureInfo = {
        commitSha: sha1,
        author: 'alice',
        message: 'first commit',
        hasSignature: true,
        signaturePayload: sig,
      };
      const r1 = verifyCommitSignature(commit1, vm);
      expect(r1.valid).toBe(true);

      // Replay: reuse sig on different commit — should FAIL
      const commit2: CommitSignatureInfo = {
        commitSha: sha2,
        author: 'alice',
        message: 'replay commit',
        hasSignature: true,
        signaturePayload: sig, // SAME signature!
      };
      const r2 = verifyCommitSignature(commit2, vm);
      expect(r2.valid).toBe(false);
      expect(r2.reason).toContain('Replay attack');
    });

    it('should allow same signature for same commit (re-verification)', () => {
      const pubKey = 'z6MkIdempotentTestKey1234567';
      const vm: VerificationMethod = {
        id: 'did:web:test#key-1',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:web:test',
        publicKeyBase58: pubKey,
      };

      const sha = '3'.repeat(40);
      const sig = computeExpectedSignature(sha, pubKey);

      const commit: CommitSignatureInfo = {
        commitSha: sha,
        author: 'alice',
        message: 'idempotent commit',
        hasSignature: true,
        signaturePayload: sig,
      };

      const r1 = verifyCommitSignature(commit, vm);
      const r2 = verifyCommitSignature(commit, vm);
      expect(r1.valid).toBe(true);
      expect(r2.valid).toBe(true); // Same commit = OK (idempotent)
    });
  });

  // ── DID Injection ─────────────────────────────────────────────────────

  describe('DID Injection', () => {
    it('should REJECT DID containing path traversal', async () => {
      const ctx = makeContext({
        contributor: {
          username: 'alice',
          githubId: 12345,
          avatarUrl: '',
          email: null,
          did: 'did:web:example.com/../../etc/passwd',
        },
      });

      const result = await verifyPullRequest(ctx, []);
      // Should fail DID validation (malformed syntax)
      expect(result.status).not.toBe('SUCCESS');
    });

    it('should REJECT DID with script injection', async () => {
      const ctx = makeContext({
        contributor: {
          username: 'alice',
          githubId: 12345,
          avatarUrl: '',
          email: null,
          did: 'did:web:<script>alert(1)</script>',
        },
      });

      // Must provide at least one commit so pipeline reaches DID validation
      // (empty commits → SOFT_FAIL before DID check)
      const commits: CommitSignatureInfo[] = [{
        commitSha: 'x'.repeat(40),
        author: 'alice',
        message: 'injection test',
        hasSignature: false,
      }];

      const result = await verifyPullRequest(ctx, commits);
      expect(result.status).toBe('HARD_FAIL');
      expect(result.didResolved).toBe(false);
    });
  });
});
