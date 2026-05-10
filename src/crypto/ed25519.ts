/**
 * Real Ed25519 Cryptographic Operations
 *
 * Production-grade Ed25519 key generation, signing, and verification
 * using @noble/ed25519 — a zero-dependency, audited implementation.
 *
 * This module provides the REAL cryptographic primitives that replace
 * the simulated SHA-256 hash comparison in the default verification mode.
 *
 * ─── STATUS ──────────────────────────────────────────────────────────────
 * REAL: All operations use actual Ed25519 math. No simulation.
 *
 * ─── USAGE ───────────────────────────────────────────────────────────────
 * Set VERIFICATION_MODE=real_crypto in config to enable this module.
 * The verification pipeline routes through this instead of the simulated
 * hash comparison when real_crypto mode is active.
 *
 * ─── SECURITY NOTES ─────────────────────────────────────────────────────
 * - @noble/ed25519 v2 requires a synchronous SHA-512 hash function
 *   to be configured before use (see configureNobleEd25519).
 * - Private keys should never be logged or persisted in plaintext.
 * - This module is used for DEMONSTRATION of real crypto capability.
 *   In the production Heka integration, signature verification is
 *   delegated to the Credo-ts agent, not performed directly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as ed from '@noble/ed25519';
import { createHash } from 'crypto';
import { Ed25519KeyPair, SignatureVerificationResult } from './types';

// ── Noble Ed25519 v2 Configuration ────────────────────────────────────────
//
// @noble/ed25519 v2 does NOT bundle a SHA-512 implementation.
// We must provide one via the `etc.sha512Sync` hook.
// Using Node.js built-in crypto for SHA-512 — this is fast and correct.

ed.etc.sha512Sync = (...messages: Uint8Array[]): Uint8Array => {
  const hash = createHash('sha512');
  for (const msg of messages) {
    hash.update(msg);
  }
  return new Uint8Array(hash.digest());
};

/**
 * Generate a real Ed25519 keypair.
 *
 * Uses cryptographically secure random bytes for the private key.
 * The public key is derived deterministically from the private key.
 *
 * @returns A keypair with 32-byte private key and 32-byte public key
 */
export function generateKeyPair(): Ed25519KeyPair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Generate an Ed25519 keypair from a known seed (deterministic).
 *
 * Useful for testing: same seed always produces the same keypair.
 * NOT for production key generation — use generateKeyPair() instead.
 *
 * @param seed - 32-byte seed value
 * @returns Deterministic keypair derived from the seed
 */
export function generateKeyPairFromSeed(seed: Uint8Array): Ed25519KeyPair {
  if (seed.length !== 32) {
    throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  const publicKey = ed.getPublicKey(seed);
  return { privateKey: seed, publicKey };
}

/**
 * Sign a message with an Ed25519 private key.
 *
 * @param message - The message bytes to sign
 * @param privateKey - 32-byte Ed25519 private key
 * @returns 64-byte Ed25519 signature
 */
export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}

/**
 * Verify an Ed25519 signature against a message and public key.
 *
 * @param signature - 64-byte Ed25519 signature
 * @param message - The original message bytes
 * @param publicKey - 32-byte Ed25519 public key
 * @returns true if the signature is valid, false otherwise
 */
export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    // Noble throws on malformed inputs (wrong-length keys, etc.)
    // We catch and return false — the caller gets a clean boolean.
    return false;
  }
}

/**
 * Verify a commit signature against an Ed25519 public key.
 *
 * This is the real-crypto equivalent of cryptoService.verifyCommitSignature().
 * It performs actual Ed25519 verification instead of SHA-256 hash comparison.
 *
 * @param commitSha - The commit SHA that was signed
 * @param signatureHex - The signature as a hex string
 * @param publicKeyHex - The public key as a hex string
 * @returns Structured verification result with reason
 */
export function verifyCommitSignatureReal(
  commitSha: string,
  signatureHex: string,
  publicKeyHex: string
): SignatureVerificationResult {
  // ── Input validation ────────────────────────────────────────────────
  if (!commitSha || commitSha.length === 0) {
    return { valid: false, reason: 'Empty commit SHA' };
  }

  if (!signatureHex || signatureHex.length === 0) {
    return { valid: false, reason: 'Empty signature' };
  }

  if (!publicKeyHex || publicKeyHex.length === 0) {
    return { valid: false, reason: 'Empty public key' };
  }

  // ── Parse hex inputs ────────────────────────────────────────────────
  let signature: Uint8Array;
  let publicKey: Uint8Array;

  try {
    signature = hexToBytes(signatureHex);
  } catch {
    return { valid: false, reason: 'Malformed signature: invalid hex encoding' };
  }

  try {
    publicKey = hexToBytes(publicKeyHex);
  } catch {
    return { valid: false, reason: 'Malformed public key: invalid hex encoding' };
  }

  // ── Length validation ───────────────────────────────────────────────
  if (signature.length !== 64) {
    return {
      valid: false,
      reason: `Invalid signature length: expected 64 bytes, got ${signature.length}`,
    };
  }

  if (publicKey.length !== 32) {
    return {
      valid: false,
      reason: `Invalid public key length: expected 32 bytes, got ${publicKey.length}`,
    };
  }

  // ── Verify ──────────────────────────────────────────────────────────
  const message = new TextEncoder().encode(commitSha);
  const isValid = verify(signature, message, publicKey);

  return {
    valid: isValid,
    reason: isValid
      ? 'Ed25519 signature verified against public key'
      : 'Ed25519 signature does not match public key — possible identity spoofing',
  };
}

// ── Hex Utilities ─────────────────────────────────────────────────────────

/** Convert a hex string to Uint8Array. Throws on invalid hex. */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${i}`);
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

/** Convert Uint8Array to hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
