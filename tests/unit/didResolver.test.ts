/**
 * Unit Tests: DID Resolver
 *
 * Tests DID validation, resolution, and DID Document generation.
 */

import { validateDID, resolveDID, resolveDIDDocument, extractVerificationMethod } from '../../src/services/didResolver';

describe('DID Resolver', () => {
  // ── validateDID() ─────────────────────────────────────────────────────

  describe('validateDID()', () => {
    it('should accept valid did:key', () => {
      const result = validateDID('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
      expect(result.valid).toBe(true);
    });

    it('should accept valid did:web', () => {
      const result = validateDID('did:web:example.com:users:alice');
      expect(result.valid).toBe(true);
    });

    it('should reject empty string', () => {
      const result = validateDID('');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('empty');
    });

    it('should reject malformed DID (no method)', () => {
      const result = validateDID('did::nomethod');
      expect(result.valid).toBe(false);
    });

    it('should reject unsupported DID method', () => {
      const result = validateDID('did:ion:EiDk2RpPVuC4wNANUTn_4YXJczjzi10zLG1XE4AjkcGOLA');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Unsupported');
    });

    it('should reject DID with special characters', () => {
      const result = validateDID('did:web:example.com/<script>alert(1)</script>');
      expect(result.valid).toBe(false);
    });

    it('should reject null/undefined (via type coercion)', () => {
      const result = validateDID(null as any);
      expect(result.valid).toBe(false);
    });
  });

  // ── resolveDID() ──────────────────────────────────────────────────────

  describe('resolveDID()', () => {
    it('should use contributor-provided DID when valid', () => {
      const result = resolveDID('alice', 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
      expect(result.did).toBe('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid contributor-provided DID', () => {
      const result = resolveDID('alice', 'not-a-did');
      expect(result.did).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should generate fallback DID when none provided', () => {
      const result = resolveDID('alice');
      expect(result.did).toBe('did:web:example.com:users:alice');
      expect(result.error).toBeUndefined();
    });

    it('should generate different DIDs for different usernames', () => {
      const r1 = resolveDID('alice');
      const r2 = resolveDID('bob');
      expect(r1.did).not.toBe(r2.did);
    });
  });

  // ── resolveDIDDocument() ──────────────────────────────────────────────

  describe('resolveDIDDocument()', () => {
    it('should return valid DID Document for valid DID', () => {
      const result = resolveDIDDocument('did:web:example.com:users:alice');
      expect(result.document).not.toBeNull();
      expect(result.document!.id).toBe('did:web:example.com:users:alice');
      expect(result.document!.verificationMethod).toHaveLength(1);
    });

    it('should include public key material in verification method', () => {
      const result = resolveDIDDocument('did:web:example.com:users:alice');
      const vm = result.document!.verificationMethod[0];
      expect(vm.publicKeyBase58).toBeDefined();
      expect(vm.publicKeyBase58!.startsWith('z6Mk')).toBe(true);
    });

    it('should return deterministic keys for same DID', () => {
      const r1 = resolveDIDDocument('did:web:example.com:users:alice');
      const r2 = resolveDIDDocument('did:web:example.com:users:alice');
      expect(r1.document!.verificationMethod[0].publicKeyBase58)
        .toBe(r2.document!.verificationMethod[0].publicKeyBase58);
    });

    it('should return different keys for different DIDs', () => {
      const r1 = resolveDIDDocument('did:web:example.com:users:alice');
      const r2 = resolveDIDDocument('did:web:example.com:users:bob');
      expect(r1.document!.verificationMethod[0].publicKeyBase58)
        .not.toBe(r2.document!.verificationMethod[0].publicKeyBase58);
    });

    it('should fail for invalid DID', () => {
      const result = resolveDIDDocument('invalid');
      expect(result.document).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should include authentication reference', () => {
      const result = resolveDIDDocument('did:web:example.com:users:alice');
      expect(result.document!.authentication).toBeDefined();
      expect(result.document!.authentication!.length).toBeGreaterThan(0);
    });

    it('should include service endpoints', () => {
      const result = resolveDIDDocument('did:web:example.com:users:alice');
      expect(result.document!.service).toBeDefined();
      expect(result.document!.service!.length).toBeGreaterThan(0);
      expect(result.document!.service![0].type).toBe('GitHubProfile');
    });
  });

  // ── extractVerificationMethod() ───────────────────────────────────────

  describe('extractVerificationMethod()', () => {
    it('should extract the primary verification method', () => {
      const { document } = resolveDIDDocument('did:web:example.com:users:alice');
      const vm = extractVerificationMethod(document!);
      expect(vm).not.toBeNull();
      expect(vm!.type).toBe('Ed25519VerificationKey2020');
    });

    it('should return null for document with no methods', () => {
      const emptyDoc = { id: 'did:web:test', verificationMethod: [] };
      const vm = extractVerificationMethod(emptyDoc);
      expect(vm).toBeNull();
    });
  });
});
