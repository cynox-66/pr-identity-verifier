/**
 * Unit Tests: Crypto Service
 *
 * Tests signature verification, replay protection, and nonce generation.
 */

import {
  verifyCommitSignature,
  computeExpectedSignature,
  generateVerificationNonce,
  clearReplayRegistry,
  getReplayRegistrySize,
} from '../../src/services/cryptoService';
import { CommitSignatureInfo, VerificationMethod } from '../../src/types/verification';

// ── Test fixtures ─────────────────────────────────────────────────────────

function makeVerificationMethod(publicKeyBase58: string): VerificationMethod {
  return {
    id: 'did:web:example.com:users:alice#key-1',
    type: 'Ed25519VerificationKey2020',
    controller: 'did:web:example.com:users:alice',
    publicKeyBase58,
  };
}

function makeCommit(
  sha: string,
  opts: Partial<CommitSignatureInfo> = {}
): CommitSignatureInfo {
  return {
    commitSha: sha,
    author: 'alice',
    message: 'test commit',
    hasSignature: true,
    signaturePayload: opts.signaturePayload,
    ...opts,
  };
}

describe('Crypto Service', () => {
  beforeEach(() => {
    clearReplayRegistry();
  });

  // ── computeExpectedSignature() ────────────────────────────────────────

  describe('computeExpectedSignature()', () => {
    it('should be deterministic for same inputs', () => {
      const sig1 = computeExpectedSignature('abc123', 'pubkey1');
      const sig2 = computeExpectedSignature('abc123', 'pubkey1');
      expect(sig1).toBe(sig2);
    });

    it('should differ for different commit SHAs', () => {
      const sig1 = computeExpectedSignature('abc123', 'pubkey1');
      const sig2 = computeExpectedSignature('def456', 'pubkey1');
      expect(sig1).not.toBe(sig2);
    });

    it('should differ for different public keys', () => {
      const sig1 = computeExpectedSignature('abc123', 'pubkey1');
      const sig2 = computeExpectedSignature('abc123', 'pubkey2');
      expect(sig1).not.toBe(sig2);
    });
  });

  // ── verifyCommitSignature() ───────────────────────────────────────────

  describe('verifyCommitSignature()', () => {
    const publicKey = 'z6MktestPublicKey123456789';
    const vm = makeVerificationMethod(publicKey);
    const commitSha = 'a1b2c3d4e5f6789012345678901234567890abcd';

    it('should PASS for valid signature (correct DID)', () => {
      const expectedSig = computeExpectedSignature(commitSha, publicKey);
      const commit = makeCommit(commitSha, { signaturePayload: expectedSig });

      const result = verifyCommitSignature(commit, vm);
      expect(result.valid).toBe(true);
      expect(result.reason).toContain('verified');
    });

    it('should FAIL for invalid signature (wrong DID)', () => {
      const wrongSig = computeExpectedSignature(commitSha, 'wrong-public-key');
      const commit = makeCommit(commitSha, { signaturePayload: wrongSig });

      const result = verifyCommitSignature(commit, vm);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not match');
    });

    it('should FAIL for unsigned commit', () => {
      const commit = makeCommit(commitSha, { hasSignature: false, signaturePayload: undefined });

      const result = verifyCommitSignature(commit, vm);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no cryptographic signature');
    });

    it('should FAIL for commit with no signature payload', () => {
      const commit = makeCommit(commitSha, { hasSignature: true, signaturePayload: undefined });

      const result = verifyCommitSignature(commit, vm);
      expect(result.valid).toBe(false);
    });

    it('should FAIL when verification method has no public key', () => {
      const noKeyVm: VerificationMethod = {
        id: 'did:web:test#key-1',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:web:test',
        // No publicKeyBase58
      };

      const expectedSig = computeExpectedSignature(commitSha, 'any');
      const commit = makeCommit(commitSha, { signaturePayload: expectedSig });

      const result = verifyCommitSignature(commit, noKeyVm);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no public key material');
    });
  });

  // ── Replay Protection ────────────────────────────────────────────────

  describe('Replay Protection', () => {
    const publicKey = 'z6MktestReplayKey123456789';
    const vm = makeVerificationMethod(publicKey);

    it('should accept same signature for same commit (idempotent)', () => {
      const sha = 'replay1111111111111111111111111111111111aa';
      const sig = computeExpectedSignature(sha, publicKey);
      const commit = makeCommit(sha, { signaturePayload: sig });

      const r1 = verifyCommitSignature(commit, vm);
      const r2 = verifyCommitSignature(commit, vm);

      expect(r1.valid).toBe(true);
      expect(r2.valid).toBe(true); // Same commit + same sig = OK
    });

    it('should REJECT signature reused across different commits', () => {
      const sha1 = 'replay2222222222222222222222222222222222bb';
      const sha2 = 'replay3333333333333333333333333333333333cc';
      const sig = computeExpectedSignature(sha1, publicKey);

      // First commit — valid
      const commit1 = makeCommit(sha1, { signaturePayload: sig });
      const r1 = verifyCommitSignature(commit1, vm);
      expect(r1.valid).toBe(true);

      // Second commit reusing same signature — REPLAY ATTACK
      const commit2 = makeCommit(sha2, { signaturePayload: sig });
      const r2 = verifyCommitSignature(commit2, vm);
      expect(r2.valid).toBe(false);
      expect(r2.reason).toContain('Replay attack');
    });

    it('should track registry size correctly', () => {
      expect(getReplayRegistrySize()).toBe(0);

      const sha = 'replay4444444444444444444444444444444444dd';
      const sig = computeExpectedSignature(sha, publicKey);
      const commit = makeCommit(sha, { signaturePayload: sig });

      verifyCommitSignature(commit, vm);
      expect(getReplayRegistrySize()).toBe(1);
    });

    it('should reset on clear', () => {
      const sha = 'replay5555555555555555555555555555555555ee';
      const sig = computeExpectedSignature(sha, publicKey);
      const commit = makeCommit(sha, { signaturePayload: sig });

      verifyCommitSignature(commit, vm);
      expect(getReplayRegistrySize()).toBe(1);

      clearReplayRegistry();
      expect(getReplayRegistrySize()).toBe(0);
    });
  });

  // ── generateVerificationNonce() ──────────────────────────────────────

  describe('generateVerificationNonce()', () => {
    it('should generate 32-character hex nonce', () => {
      const nonce = generateVerificationNonce('owner', 'repo', 1, 'sha123');
      expect(nonce).toHaveLength(32);
      expect(/^[a-f0-9]+$/.test(nonce)).toBe(true);
    });

    it('should generate different nonces for different PRs', () => {
      const n1 = generateVerificationNonce('owner', 'repo', 1, 'sha123');
      const n2 = generateVerificationNonce('owner', 'repo', 2, 'sha123');
      expect(n1).not.toBe(n2);
    });

    it('should generate different nonces for same PR (entropy)', () => {
      const n1 = generateVerificationNonce('owner', 'repo', 1, 'sha123');
      const n2 = generateVerificationNonce('owner', 'repo', 1, 'sha123');
      expect(n1).not.toBe(n2); // Random entropy ensures uniqueness
    });
  });
});
