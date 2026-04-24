/**
 * Unit Tests: DID Extractor Utility
 *
 * Tests regex-based DID extraction from free-form text.
 */

import { extractDIDFromText } from '../../src/utils/didExtractor';

describe('DID Extractor', () => {
  it('should extract did:key from text', () => {
    const result = extractDIDFromText('DID: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
    expect(result).toBe('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
  });

  it('should extract did:web from text', () => {
    const result = extractDIDFromText('My DID is did:web:example.com:users:alice');
    expect(result).toBe('did:web:example.com:users:alice');
  });

  it('should return null for text without DID', () => {
    expect(extractDIDFromText('No DID in this text')).toBeNull();
  });

  it('should return null for null input', () => {
    expect(extractDIDFromText(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(extractDIDFromText(undefined)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractDIDFromText('')).toBeNull();
  });

  it('should extract first DID when multiple are present', () => {
    const text = 'First: did:key:z6Mk1234 Second: did:web:example.com:users:bob';
    const result = extractDIDFromText(text);
    expect(result).toBe('did:key:z6Mk1234');
  });

  it('should handle DID embedded in markdown', () => {
    const text = '**DID:** `did:web:example.com:users:alice`';
    const result = extractDIDFromText(text);
    expect(result).toBe('did:web:example.com:users:alice');
  });
});
