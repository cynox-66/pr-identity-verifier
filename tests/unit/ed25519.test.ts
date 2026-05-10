/**
 * Real Ed25519 Cryptography Tests
 *
 * Tests the actual Ed25519 implementation using @noble/ed25519.
 * These tests prove REAL cryptographic capability — no simulation.
 *
 * Test categories:
 *   - Key generation (random + deterministic)
 *   - Signing and verification (happy path)
 *   - Tampered message detection
 *   - Wrong key detection
 *   - Malformed input handling
 *   - Commit-SHA-bound verification
 *   - Hex encoding edge cases
 */

import {
  generateKeyPair,
  generateKeyPairFromSeed,
  sign,
  verify,
  verifyCommitSignatureReal,
  bytesToHex,
  hexToBytes,
} from '../../src/crypto/ed25519';

describe('Real Ed25519 Cryptography', () => {

  // ── Key Generation ────────────────────────────────────────────────────

  describe('Key Generation', () => {
    it('should generate a valid keypair with correct lengths', () => {
      const kp = generateKeyPair();
      expect(kp.privateKey).toBeInstanceOf(Uint8Array);
      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.privateKey.length).toBe(32);
      expect(kp.publicKey.length).toBe(32);
    });

    it('should generate unique keypairs on each call', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      expect(bytesToHex(kp1.privateKey)).not.toBe(bytesToHex(kp2.privateKey));
      expect(bytesToHex(kp1.publicKey)).not.toBe(bytesToHex(kp2.publicKey));
    });

    it('should generate deterministic keypair from seed', () => {
      const seed = new Uint8Array(32).fill(42);
      const kp1 = generateKeyPairFromSeed(seed);
      const kp2 = generateKeyPairFromSeed(seed);
      expect(bytesToHex(kp1.publicKey)).toBe(bytesToHex(kp2.publicKey));
    });

    it('should reject seed with wrong length', () => {
      expect(() => generateKeyPairFromSeed(new Uint8Array(16))).toThrow('32 bytes');
      expect(() => generateKeyPairFromSeed(new Uint8Array(64))).toThrow('32 bytes');
    });
  });

  // ── Sign and Verify ───────────────────────────────────────────────────

  describe('Sign and Verify', () => {
    it('should produce valid signature that verifies', () => {
      const kp = generateKeyPair();
      const message = new TextEncoder().encode('hello world');
      const signature = sign(message, kp.privateKey);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);
      expect(verify(signature, message, kp.publicKey)).toBe(true);
    });

    it('should verify signature on commit SHA', () => {
      const kp = generateKeyPair();
      const commitSha = 'a'.repeat(40);
      const message = new TextEncoder().encode(commitSha);
      const signature = sign(message, kp.privateKey);

      expect(verify(signature, message, kp.publicKey)).toBe(true);
    });

    it('should produce different signatures for different messages', () => {
      const kp = generateKeyPair();
      const msg1 = new TextEncoder().encode('message1');
      const msg2 = new TextEncoder().encode('message2');
      const sig1 = sign(msg1, kp.privateKey);
      const sig2 = sign(msg2, kp.privateKey);

      expect(bytesToHex(sig1)).not.toBe(bytesToHex(sig2));
    });
  });

  // ── Tampered Message Detection ────────────────────────────────────────

  describe('Tampered Message Detection', () => {
    it('should REJECT signature when message is tampered', () => {
      const kp = generateKeyPair();
      const original = new TextEncoder().encode('original commit sha');
      const tampered = new TextEncoder().encode('tampered commit sha');
      const signature = sign(original, kp.privateKey);

      expect(verify(signature, original, kp.publicKey)).toBe(true);
      expect(verify(signature, tampered, kp.publicKey)).toBe(false);
    });

    it('should REJECT when even one byte of message changes', () => {
      const kp = generateKeyPair();
      const message = new TextEncoder().encode('a'.repeat(40));
      const signature = sign(message, kp.privateKey);

      const tampered = new Uint8Array(message);
      tampered[0] = tampered[0] ^ 0xff; // flip one byte

      expect(verify(signature, message, kp.publicKey)).toBe(true);
      expect(verify(signature, tampered, kp.publicKey)).toBe(false);
    });
  });

  // ── Wrong Key Detection ───────────────────────────────────────────────

  describe('Wrong Key Detection', () => {
    it('should REJECT signature verified with wrong public key', () => {
      const alice = generateKeyPair();
      const eve = generateKeyPair();
      const message = new TextEncoder().encode('alice signed this');
      const signature = sign(message, alice.privateKey);

      expect(verify(signature, message, alice.publicKey)).toBe(true);
      expect(verify(signature, message, eve.publicKey)).toBe(false);
    });
  });

  // ── Malformed Input Handling ──────────────────────────────────────────

  describe('Malformed Input Handling', () => {
    it('should return false for wrong-length signature', () => {
      const kp = generateKeyPair();
      const message = new TextEncoder().encode('test');
      const badSig = new Uint8Array(32); // Should be 64
      expect(verify(badSig, message, kp.publicKey)).toBe(false);
    });

    it('should return false for wrong-length public key', () => {
      const message = new TextEncoder().encode('test');
      const sig = new Uint8Array(64);
      const badKey = new Uint8Array(16); // Should be 32
      expect(verify(sig, message, badKey)).toBe(false);
    });

    it('should return false for empty inputs', () => {
      expect(verify(new Uint8Array(0), new Uint8Array(0), new Uint8Array(0))).toBe(false);
    });
  });

  // ── Commit Signature Verification (Hex API) ──────────────────────────

  describe('Commit Signature Verification (Real)', () => {
    it('should verify a real Ed25519 commit signature', () => {
      const kp = generateKeyPair();
      const commitSha = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const message = new TextEncoder().encode(commitSha);
      const signature = sign(message, kp.privateKey);

      const result = verifyCommitSignatureReal(
        commitSha,
        bytesToHex(signature),
        bytesToHex(kp.publicKey)
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toContain('Ed25519');
    });

    it('should REJECT commit signature with wrong key', () => {
      const alice = generateKeyPair();
      const eve = generateKeyPair();
      const commitSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const message = new TextEncoder().encode(commitSha);
      const signature = sign(message, alice.privateKey);

      const result = verifyCommitSignatureReal(
        commitSha,
        bytesToHex(signature),
        bytesToHex(eve.publicKey) // Wrong key!
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not match');
    });

    it('should REJECT empty commit SHA', () => {
      const result = verifyCommitSignatureReal('', 'aa'.repeat(64), 'bb'.repeat(32));
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Empty commit SHA');
    });

    it('should REJECT empty signature', () => {
      const result = verifyCommitSignatureReal('a'.repeat(40), '', 'bb'.repeat(32));
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Empty signature');
    });

    it('should REJECT empty public key', () => {
      const result = verifyCommitSignatureReal('a'.repeat(40), 'aa'.repeat(64), '');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Empty public key');
    });

    it('should REJECT malformed hex in signature', () => {
      const result = verifyCommitSignatureReal('a'.repeat(40), 'ZZZZ', 'bb'.repeat(32));
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Malformed signature');
    });

    it('should REJECT malformed hex in public key', () => {
      const result = verifyCommitSignatureReal('a'.repeat(40), 'aa'.repeat(64), 'ZZZZ');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Malformed public key');
    });

    it('should REJECT wrong-length signature (not 64 bytes)', () => {
      const kp = generateKeyPair();
      const result = verifyCommitSignatureReal(
        'a'.repeat(40),
        'aa'.repeat(32), // 32 bytes instead of 64
        bytesToHex(kp.publicKey)
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid signature length');
    });

    it('should REJECT wrong-length public key (not 32 bytes)', () => {
      const result = verifyCommitSignatureReal(
        'a'.repeat(40),
        'aa'.repeat(64),
        'bb'.repeat(16) // 16 bytes instead of 32
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid public key length');
    });
  });

  // ── Hex Utilities ─────────────────────────────────────────────────────

  describe('Hex Utilities', () => {
    it('should roundtrip bytes through hex encoding', () => {
      const original = new Uint8Array([0, 1, 127, 128, 255]);
      const hex = bytesToHex(original);
      const decoded = hexToBytes(hex);
      expect(Array.from(decoded)).toEqual(Array.from(original));
    });

    it('should reject odd-length hex strings', () => {
      expect(() => hexToBytes('abc')).toThrow('odd length');
    });

    it('should reject invalid hex characters', () => {
      expect(() => hexToBytes('zzzz')).toThrow('Invalid hex');
    });
  });
});
