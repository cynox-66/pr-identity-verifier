/**
 * Decentralized Identifier (DID) Service — SIMULATED
 *
 * This module mimics the two fundamental DID operations:
 *   1. Resolve a username → DID URI   (e.g. did:web:example.com/users/alice)
 *   2. Dereference a DID → DID Document (public keys, service endpoints, etc.)
 *
 * Everything here is deterministic and in-memory — no network calls, no crypto.
 *
 * ─── WHERE REAL LOGIC WILL GO ───────────────────────────────────────────
 *
 * resolveDID():
 *   • Query a DID registry (on-chain, DNS, or a .well-known endpoint)
 *   • Support multiple DID methods: did:webvh, did:key, did:ion, did:peer
 *
 * getDIDDocument():
 *   • Fetch the actual DID Document from the DID method's resolution endpoint
 *   • Validate the document structure per W3C DID Core spec
 *   • Cache results with TTL to avoid repeated lookups
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import { DIDDocument } from '../types/contributor';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Map a GitHub username to a DID URI.
 *
 * If the contributor has provided their own DID (e.g. in the PR body),
 * we use it directly — this is the "contributor-provided DID" path.
 * Otherwise we fall back to generating a mock did:web URI.
 *
 * did:web spec encodes the domain + path:
 *   did:web:example.com:users:alice  →  https://example.com/users/alice/did.json
 *
 * We use a simplified slash-based format for readability in this PoC.
 *
 * FUTURE: Replace mock DID generation with real DID resolution — query a
 *         DID registry, .well-known endpoint, or on-chain anchor.
 *
 * @param username    - GitHub username (used for fallback DID generation)
 * @param providedDid - Optional DID supplied by the contributor in PR metadata
 */
export function resolveDID(username: string, providedDid?: string): string {
  // ── Contributor-provided DID path ────────────────────────────────────
  if (providedDid) {
    logger.debug('Using contributor-provided DID', { username, did: providedDid });
    return providedDid;
  }

  // ── Fallback: generate a mock DID from the username ──────────────────
  const did = `did:web:${config.DID_DOMAIN}/users/${username}`;
  logger.debug('Using fallback mock DID', { username, did });
  return did;
}

/**
 * Return a mock DID Document for the given DID.
 *
 * The structure mirrors W3C DID Core:
 *   https://www.w3.org/TR/did-core/#core-properties
 *
 * All key material is fake — in production these would be real Ed25519 or
 * P-256 keys controlled by the DID subject.
 */
export function getDIDDocument(did: string): DIDDocument {
  // Derive a deterministic "key" suffix from the DID so every call for the
  // same DID returns the same document (good for demo reproducibility).
  const subjectId = did.split('/').pop() || 'unknown';
  const keyId = `${did}#key-1`;

  const doc: DIDDocument = {
    id: did,

    publicKey: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        // Mock base58 key — deterministic per subject so logs are stable
        publicKeyBase58: `z6Mk${Buffer.from(subjectId).toString('base64').slice(0, 32)}`,
      },
    ],

    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
      },
    ],

    service: [
      {
        id: `${did}#github`,
        type: 'GitHubProfile',
        serviceEndpoint: `https://github.com/${subjectId}`,
      },
    ],
  };

  logger.debug('DID Document retrieved', { did, keys: doc.publicKey.length });
  return doc;
}
