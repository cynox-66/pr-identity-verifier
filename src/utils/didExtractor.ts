/**
 * DID Extraction Utility
 *
 * Extracts a Decentralized Identifier (DID) from user-provided text
 * (e.g. PR title or body). This allows contributors to supply their
 * own DID for identity verification instead of relying solely on
 * mock/system-generated DIDs.
 *
 * Supported DID methods:
 *   - did:key:...   (self-certifying, based on public key)
 *   - did:web:...   (domain-based, resolved via HTTPS)
 *
 * ─── WHERE REAL LOGIC WILL GO ───────────────────────────────────────────
 *
 * extractDIDFromText():
 *   • Replace regex extraction with a GitHub profile DID lookup
 *     (e.g. fetch DID from user's GitHub bio, pinned gist, or .well-known)
 *   • Support additional DID methods: did:ion, did:peer, did:webvh
 *
 * validateDID():
 *   • Perform real DID resolution via a universal resolver
 *   • Verify that the DID document exists and is well-formed
 *   • Cryptographically verify DID ownership (challenge–response)
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import { logger } from './logger';

/**
 * Regex to match did:key and did:web identifiers.
 *
 * Pattern breakdown:
 *   did:          — literal DID scheme prefix
 *   (key|web)     — supported DID methods
 *   :             — method-specific separator
 *   [a-zA-Z0-9._:%-]+  — method-specific identifier characters
 *
 * We capture the first valid match in the text.
 */
const DID_PATTERN = /did:(key|web):[a-zA-Z0-9._:%-]+/;

/** Valid DID method prefixes we accept */
const VALID_DID_PREFIXES = ['did:key:', 'did:web:'] as const;

/**
 * Check whether a DID string starts with a supported method prefix.
 *
 * This is intentionally simple — real validation would resolve the DID
 * and verify the document structure per W3C DID Core spec.
 */
function isValidDID(did: string): boolean {
  return VALID_DID_PREFIXES.some((prefix) => did.startsWith(prefix));
}

/**
 * Extract a DID from free-form text (PR title or body).
 *
 * Returns the first valid DID found, or null if none is present.
 * Invalid DIDs (wrong prefix) are logged as warnings and ignored.
 *
 * @param text - The text to scan for a DID (may be null/undefined)
 * @returns The extracted DID string, or null
 */
export function extractDIDFromText(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }

  const match = text.match(DID_PATTERN);

  if (!match) {
    return null;
  }

  const did = match[0];

  // Validate that the extracted DID uses a supported method
  if (!isValidDID(did)) {
    logger.warn('Extracted DID has unsupported method prefix — ignoring', { did });
    return null;
  }

  logger.info('DID extracted from text', { did });
  return did;
}
