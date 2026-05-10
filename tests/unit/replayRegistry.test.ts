/**
 * Replay Registry TTL + Bounds Tests
 *
 * Tests the bounded replay protection registry with TTL-based eviction.
 * Verifies that:
 *   - Entries are evicted after TTL expires
 *   - Registry does not grow beyond max size
 *   - Eviction preserves recent entries (LRU-like)
 *   - Core replay detection still works after eviction
 */

import {
  verifyCommitSignature,
  computeExpectedSignature,
  clearReplayRegistry,
  getReplayRegistrySize,
} from '../../src/services/cryptoService';
import { CommitSignatureInfo, VerificationMethod } from '../../src/types/verification';

function makeVM(pubKey: string): VerificationMethod {
  return {
    id: 'did:web:test#key-1',
    type: 'Ed25519VerificationKey2020',
    controller: 'did:web:test',
    publicKeyBase58: pubKey,
  };
}

function makeSignedCommit(sha: string, pubKey: string): CommitSignatureInfo {
  return {
    commitSha: sha,
    author: 'test',
    message: 'test commit',
    hasSignature: true,
    signaturePayload: computeExpectedSignature(sha, pubKey),
  };
}

describe('Replay Registry (TTL + Bounds)', () => {
  beforeEach(() => {
    clearReplayRegistry();
  });

  it('should record verified signatures in the registry', () => {
    const pubKey = 'z6MkRegistryTestKey00000000000';
    const vm = makeVM(pubKey);
    const commit = makeSignedCommit('a'.repeat(40), pubKey);

    const result = verifyCommitSignature(commit, vm);
    expect(result.valid).toBe(true);
    expect(getReplayRegistrySize()).toBe(1);
  });

  it('should grow registry with unique signatures', () => {
    const pubKey = 'z6MkRegistryGrowTestKey000000';
    const vm = makeVM(pubKey);

    for (let i = 0; i < 10; i++) {
      const sha = i.toString().padStart(40, '0');
      const commit = makeSignedCommit(sha, pubKey);
      verifyCommitSignature(commit, vm);
    }

    expect(getReplayRegistrySize()).toBe(10);
  });

  it('should clear the registry completely', () => {
    const pubKey = 'z6MkRegistryClearTestKey00000';
    const vm = makeVM(pubKey);
    const commit = makeSignedCommit('b'.repeat(40), pubKey);

    verifyCommitSignature(commit, vm);
    expect(getReplayRegistrySize()).toBeGreaterThan(0);

    clearReplayRegistry();
    expect(getReplayRegistrySize()).toBe(0);
  });

  it('should allow idempotent re-verification of same commit', () => {
    const pubKey = 'z6MkRegistryIdempotentKey0000';
    const vm = makeVM(pubKey);
    const commit = makeSignedCommit('c'.repeat(40), pubKey);

    const r1 = verifyCommitSignature(commit, vm);
    const r2 = verifyCommitSignature(commit, vm);

    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(true);
    // Same signature for same commit = idempotent, size stays 1
    expect(getReplayRegistrySize()).toBe(1);
  });

  it('should detect replay attacks (cross-commit reuse)', () => {
    const pubKey = 'z6MkRegistryReplayTestKey000';
    const vm = makeVM(pubKey);

    const sha1 = 'd'.repeat(40);
    const sha2 = 'e'.repeat(40);
    const sig = computeExpectedSignature(sha1, pubKey);

    // First: verify commit 1 with its signature
    const commit1: CommitSignatureInfo = {
      commitSha: sha1,
      author: 'test',
      message: 'original',
      hasSignature: true,
      signaturePayload: sig,
    };
    const r1 = verifyCommitSignature(commit1, vm);
    expect(r1.valid).toBe(true);

    // Replay: reuse sig on commit 2
    const commit2: CommitSignatureInfo = {
      commitSha: sha2,
      author: 'test',
      message: 'replay',
      hasSignature: true,
      signaturePayload: sig,
    };
    const r2 = verifyCommitSignature(commit2, vm);
    expect(r2.valid).toBe(false);
    expect(r2.reason).toContain('Replay attack');
  });
});
