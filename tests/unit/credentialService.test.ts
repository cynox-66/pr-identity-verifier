/**
 * Unit Tests: Credential Service
 *
 * Tests credential issuance, validation (proof, expiry, structure),
 * and issuer trust checks.
 */

import { issueCredential, validateCredential, isIssuerTrusted } from '../../src/services/credentialService';
import { VerifiableCredential } from '../../src/types/verification';

describe('Credential Service', () => {
  // ── issueCredential() ─────────────────────────────────────────────────

  describe('issueCredential()', () => {
    it('should issue credential with correct structure', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      expect(cred['@context']).toBeDefined();
      expect(cred.type).toContain('VerifiableCredential');
      expect(cred.type).toContain('PersonaCredential');
      expect(cred.issuer).toBe('did:web:issuer.example');
      expect(cred.credentialSubject.id).toBe('did:web:example.com:users:alice');
    });

    it('should include proof block', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      expect(cred.proof).toBeDefined();
      expect(cred.proof!.type).toBe('Ed25519Signature2020');
      expect(cred.proof!.proofPurpose).toBe('assertionMethod');
      expect(cred.proof!.proofValue).toBeTruthy();
    });

    it('should set expiration date in the future', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      expect(cred.expirationDate).toBeDefined();
      const expiry = new Date(cred.expirationDate!);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });

    it('should produce different proofs for different subjects', () => {
      const c1 = issueCredential('did:web:example.com:users:alice');
      const c2 = issueCredential('did:web:example.com:users:bob');
      expect(c1.proof!.proofValue).not.toBe(c2.proof!.proofValue);
    });
  });

  // ── validateCredential() ──────────────────────────────────────────────

  describe('validateCredential()', () => {
    it('should PASS for correctly issued credential', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      const result = validateCredential(cred);
      expect(result.valid).toBe(true);
    });

    it('should FAIL for tampered proof value', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      cred.proof!.proofValue = 'tampered-proof-value';
      const result = validateCredential(cred);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid');
    });

    it('should FAIL for missing proof block', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      delete cred.proof;
      const result = validateCredential(cred);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no proof');
    });

    it('should FAIL for expired credential', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      cred.expirationDate = '2020-01-01T00:00:00Z'; // past
      const result = validateCredential(cred);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should FAIL for missing required fields', () => {
      const cred = { '@context': [], type: [] } as any;
      const result = validateCredential(cred);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('missing required');
    });

    it('should FAIL for credential with wrong subject (swapped subject)', () => {
      const cred = issueCredential('did:web:example.com:users:alice');
      // Tamper: change subject to bob (proof was computed for alice)
      cred.credentialSubject.id = 'did:web:example.com:users:bob';
      const result = validateCredential(cred);
      expect(result.valid).toBe(false);
    });
  });

  // ── isIssuerTrusted() ─────────────────────────────────────────────────

  describe('isIssuerTrusted()', () => {
    it('should trust configured issuer', () => {
      const result = isIssuerTrusted('did:web:issuer.example');
      expect(result.trusted).toBe(true);
    });

    it('should NOT trust unknown issuer', () => {
      const result = isIssuerTrusted('did:web:evil-issuer.example');
      expect(result.trusted).toBe(false);
      expect(result.reason).toContain('NOT');
    });

    it('should NOT trust empty string', () => {
      const result = isIssuerTrusted('');
      expect(result.trusted).toBe(false);
    });
  });
});
