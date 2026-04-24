/**
 * DID Resolution Service
 *
 * Handles DID resolution and DID Document retrieval:
 *   1. Resolve a DID URI → validate format and method
 *   2. Dereference a DID → return the DID Document with key material
 *
 * The mock implementation is structured IDENTICALLY to a real DID resolver:
 *   - Input validation (format, method support)
 *   - Resolution (URI → document)
 *   - Key material extraction (verificationMethod)
 *
 * ─── PRODUCTION REPLACEMENT POINTS ──────────────────────────────────────
 *
 * resolveDID():
 *   → Query a universal resolver (https://dev.uniresolver.io/)
 *   → Support did:webvh, did:key, did:ion, did:peer
 *   → Cache results with TTL
 *
 * resolveDIDDocument():
 *   → Fetch real DID Document from method-specific endpoint
 *   → Validate structure per W3C DID Core spec
 *   → Extract and validate key material
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import { DIDDocument, VerificationMethod } from '../types/verification';
import { config } from '../config';
import { logger } from '../utils/logger';

/** Supported DID method prefixes */
const SUPPORTED_METHODS = ['did:key:', 'did:web:'] as const;

/** Regex for valid DID syntax (simplified W3C DID Syntax) */
const DID_SYNTAX = /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/;

/**
 * Validate DID format and method support.
 *
 * @returns Object with validity flag and error reason
 */
export function validateDID(did: string): { valid: boolean; reason?: string } {
  if (!did || typeof did !== 'string') {
    return { valid: false, reason: 'DID is empty or not a string' };
  }

  if (!DID_SYNTAX.test(did)) {
    return { valid: false, reason: `Malformed DID syntax: "${did}"` };
  }

  const methodSupported = SUPPORTED_METHODS.some((m) => did.startsWith(m));
  if (!methodSupported) {
    return { valid: false, reason: `Unsupported DID method in: "${did}"` };
  }

  return { valid: true };
}

/**
 * Resolve a DID URI.
 *
 * If the contributor provided a DID (from PR body), validate and use it.
 * Otherwise, generate a mock did:web from the username.
 *
 * @param username    - GitHub username (fallback DID generation)
 * @param providedDid - Optional contributor-provided DID
 * @returns Resolved DID URI, or null if resolution fails
 */
export function resolveDID(
  username: string,
  providedDid?: string
): { did: string | null; error?: string } {
  // ── Contributor-provided DID path ──────────────────────────────────
  if (providedDid) {
    const validation = validateDID(providedDid);
    if (!validation.valid) {
      logger.warn('Contributor-provided DID is invalid', {
        username,
        did: providedDid,
        reason: validation.reason,
      });
      return { did: null, error: validation.reason };
    }

    logger.debug('Resolved contributor-provided DID', { username, did: providedDid });
    return { did: providedDid };
  }

  // ── Fallback: generate mock did:web ────────────────────────────────
  const did = `did:web:${config.DID_DOMAIN}:users:${username}`;
  logger.debug('Generated fallback mock DID', { username, did });
  return { did };
}

/**
 * Resolve a DID to its DID Document.
 *
 * The mock implementation generates a deterministic document with:
 *   - One Ed25519 verification method (public key)
 *   - One authentication reference
 *   - One GitHub profile service endpoint
 *
 * Key material is deterministic per DID subject, so the same DID
 * always produces the same public key. This is critical for the
 * simulated signature verification to work correctly.
 *
 * @param did - The DID URI to resolve
 * @returns DID Document, or null if resolution fails
 */
export function resolveDIDDocument(did: string): { document: DIDDocument | null; error?: string } {
  const validation = validateDID(did);
  if (!validation.valid) {
    return { document: null, error: validation.reason };
  }

  try {
    const subjectId = extractSubjectId(did);
    const keyId = `${did}#key-1`;

    const verificationMethod: VerificationMethod = {
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      // Deterministic mock public key — same DID always produces same key.
      // This is what makes the simulated crypto work: the crypto service
      // computes expected_sig = SHA256(commitSha + publicKey), and this
      // key is deterministic per DID.
      publicKeyBase58: generateMockPublicKey(subjectId),
    };

    const document: DIDDocument = {
      id: did,
      verificationMethod: [verificationMethod],
      authentication: [keyId],
      service: [
        {
          id: `${did}#github`,
          type: 'GitHubProfile',
          serviceEndpoint: `https://github.com/${subjectId}`,
        },
      ],
    };

    logger.debug('DID Document resolved', { did, keys: document.verificationMethod.length });
    return { document };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('DID Document resolution error', { did, error: message });
    return { document: null, error: message };
  }
}

/**
 * Extract the primary verification method (public key) from a DID Document.
 *
 * @param document - Resolved DID Document
 * @returns The first verification method, or null
 */
export function extractVerificationMethod(
  document: DIDDocument
): VerificationMethod | null {
  if (!document.verificationMethod || document.verificationMethod.length === 0) {
    logger.warn('DID Document has no verification methods', { did: document.id });
    return null;
  }

  return document.verificationMethod[0];
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Extract the subject identifier from a DID URI.
 * e.g. "did:web:example.com:users:alice" → "alice"
 * e.g. "did:key:z6MkhaXg..." → "z6MkhaXg..."
 */
function extractSubjectId(did: string): string {
  const parts = did.split(':');
  return parts[parts.length - 1];
}

/**
 * Generate a deterministic mock public key from a subject identifier.
 *
 * This produces a stable "public key" that allows the simulated crypto
 * system to work consistently. The same subject always gets the same key.
 */
function generateMockPublicKey(subjectId: string): string {
  return `z6Mk${Buffer.from(subjectId).toString('base64').replace(/[=+/]/g, '').slice(0, 32)}`;
}
