/**
 * Cryptographic Primitive Types
 *
 * Shared type definitions for both simulated and real cryptographic operations.
 * These types are used across all verification modes to ensure consistent
 * interfaces regardless of the underlying crypto implementation.
 *
 * ─── STATUS ──────────────────────────────────────────────────────────────
 * REAL: These types are production-grade and will not change.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Verification mode determines which crypto backend is used.
 *
 * - 'simulated': SHA-256 hash comparison (deterministic, for testing/demo)
 * - 'real_crypto': Real Ed25519 signatures via @noble/ed25519
 */
export type VerificationMode = 'simulated' | 'real_crypto';

/**
 * Result of a signature verification operation.
 * Used by both simulated and real crypto services.
 */
export interface SignatureVerificationResult {
  valid: boolean;
  reason: string;
}

/**
 * An Ed25519 keypair with raw byte arrays.
 * Used by the real crypto module for key generation and signing.
 */
export interface Ed25519KeyPair {
  /** 32-byte private key (seed) */
  privateKey: Uint8Array;
  /** 32-byte public key */
  publicKey: Uint8Array;
}

/**
 * A signed commit payload containing the raw signature bytes.
 * This is what a real system would produce when signing a commit.
 */
export interface SignedPayload {
  /** The data that was signed (typically commit SHA or message) */
  message: Uint8Array;
  /** The Ed25519 signature bytes (64 bytes) */
  signature: Uint8Array;
  /** The public key of the signer (32 bytes) */
  signerPublicKey: Uint8Array;
}
