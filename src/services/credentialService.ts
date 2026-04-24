/**
 * Verifiable Credential Service
 *
 * Issues and validates mock Verifiable Credentials (VCs) for contributors.
 * A VC is a tamper-evident claim made by an issuer about a subject.
 *
 * This module is structured identically to a real VC system:
 *   - Issuance with proof generation
 *   - Validation with signature check + expiry + issuer trust
 *   - Deterministic outcomes (no randomness, no heuristics)
 *
 * ─── PRODUCTION REPLACEMENT POINTS ──────────────────────────────────────
 *
 * issueCredential():
 *   → Call a real VC issuer API (SpruceID, Trinsic, etc.)
 *   → Sign with issuer's private key (Ed25519 / ES256)
 *   → Return W3C Verifiable Credential JSON-LD
 *
 * validateCredential():
 *   → Verify cryptographic proof/signature
 *   → Check revocation via StatusList2021
 *   → Validate schema against credential definition
 *
 * isIssuerTrusted():
 *   → Query Trust Registry (OpenVTC, TRAIN, governance framework)
 *   → Support dynamic trust list updates
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import { createHash } from 'crypto';
import { VerifiableCredential } from '../types/verification';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Issue a mock PersonaCredential for the given subject DID.
 *
 * The credential includes a simulated proof block that mirrors the
 * W3C VC Data Model proof structure. The proof value is deterministic
 * so that validateCredential() can verify it.
 *
 * @param subjectDID - The DID of the credential subject
 * @returns A mock Verifiable Credential with proof
 */
export function issueCredential(subjectDID: string): VerifiableCredential {
  const issuanceDate = new Date().toISOString();
  const expirationDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // Deterministic proof value: HMAC-like hash of issuer + subject + issuance date
  const proofValue = createHash('sha256')
    .update(`${config.CREDENTIAL_ISSUER}:${subjectDID}:PersonaCredential`)
    .digest('hex');

  const credential: VerifiableCredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/2018/credentials/examples/v1',
    ],
    type: ['VerifiableCredential', 'PersonaCredential'],
    issuer: config.CREDENTIAL_ISSUER,
    issuanceDate,
    expirationDate,
    credentialSubject: {
      id: subjectDID,
      type: 'GitHubContributor',
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: issuanceDate,
      verificationMethod: `${config.CREDENTIAL_ISSUER}#key-1`,
      proofPurpose: 'assertionMethod',
      proofValue,
    },
  };

  logger.debug('Credential issued', { subject: subjectDID, issuer: config.CREDENTIAL_ISSUER });
  return credential;
}

/**
 * Validate a Verifiable Credential.
 *
 * Performs three checks (mirrors real VC validation):
 *   1. Proof integrity — is the proof value correct?
 *   2. Expiration — has the credential expired?
 *   3. Structure — are required fields present?
 *
 * @returns Object with validity flag and reason
 */
export function validateCredential(
  credential: VerifiableCredential
): { valid: boolean; reason: string } {
  // ── Structure check ─────────────────────────────────────────────────
  if (!credential.issuer || !credential.credentialSubject?.id) {
    return { valid: false, reason: 'Credential missing required fields (issuer or subject)' };
  }

  if (!credential.proof?.proofValue) {
    return { valid: false, reason: 'Credential has no proof block' };
  }

  // ── Expiration check ────────────────────────────────────────────────
  if (credential.expirationDate) {
    const expiry = new Date(credential.expirationDate);
    if (expiry < new Date()) {
      return { valid: false, reason: 'Credential has expired' };
    }
  }

  // ── Proof integrity check (simulated signature verification) ────────
  const expectedProof = createHash('sha256')
    .update(`${credential.issuer}:${credential.credentialSubject.id}:PersonaCredential`)
    .digest('hex');

  if (credential.proof.proofValue !== expectedProof) {
    return { valid: false, reason: 'Credential proof is invalid — possible tampering' };
  }

  logger.debug('Credential validated', { subject: credential.credentialSubject.id });
  return { valid: true, reason: 'Credential is valid and not expired' };
}

/**
 * Check whether a credential's issuer is on our trusted issuer list.
 *
 * @returns Object with trust flag and reason
 */
export function isIssuerTrusted(
  issuerDID: string
): { trusted: boolean; reason: string } {
  const trusted = config.TRUSTED_ISSUERS.includes(issuerDID);

  logger.debug('Issuer trust check', { issuer: issuerDID, trusted });
  return {
    trusted,
    reason: trusted
      ? `Issuer ${issuerDID} is in the trusted registry`
      : `Issuer ${issuerDID} is NOT in the trusted registry`,
  };
}
