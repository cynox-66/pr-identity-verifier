/**
 * Direct Pipeline Test Script
 *
 * Tests the verification pipeline without needing a real GitHub webhook.
 * This proves that DID extraction, resolution, credential issuance,
 * and scoring all work correctly end-to-end.
 *
 * Run with: npx ts-node test-pipeline.ts
 */

import 'dotenv/config';
import { extractDIDFromText } from './src/utils/didExtractor';
import { verifyContributor } from './src/services/verifier';
import { Contributor } from './src/types/contributor';

async function runTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('  PR IDENTITY VERIFIER — PIPELINE TEST');
  console.log('═'.repeat(70) + '\n');

  // ── Test 1: DID Extraction ─────────────────────────────────────────────
  console.log('━━━ Test 1: DID Extraction ━━━\n');

  const testCases = [
    { input: 'DID: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', expected: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' },
    { input: 'My DID is did:web:example.com:users:alice', expected: 'did:web:example.com:users:alice' },
    { input: 'No DID in this text', expected: null },
    { input: null, expected: null },
    { input: undefined, expected: null },
  ];

  for (const tc of testCases) {
    const result = extractDIDFromText(tc.input);
    const pass = result === tc.expected;
    console.log(`  ${pass ? '✅' : '❌'} Input: ${JSON.stringify(tc.input)}`);
    console.log(`     → Got: ${result} | Expected: ${tc.expected}`);
  }

  // ── Test 2: Pipeline WITH contributor-provided DID ─────────────────────
  console.log('\n━━━ Test 2: Verification with Contributor-Provided DID ━━━\n');

  const contributorWithDID: Contributor = {
    username: 'cynox-66',
    githubId: 12345678,
    avatarUrl: 'https://avatars.githubusercontent.com/u/12345678',
    email: null,
    gpgVerified: null,
    didLinked: false,
    did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  };

  const result1 = await verifyContributor(contributorWithDID);

  console.log(`  User:              @${contributorWithDID.username}`);
  console.log(`  DID Provided:      ${result1.checks.didProvided ? 'Yes ✅' : 'No'}`);
  console.log(`  DID:               ${result1.did}`);
  console.log(`  Method:            ${result1.verificationMethod}`);
  console.log(`  DID Resolved:      ${result1.checks.didResolved ? '✅' : '❌'}`);
  console.log(`  Credential Valid:  ${result1.checks.credentialValid ? '✅' : '❌'}`);
  console.log(`  Issuer Trusted:    ${result1.checks.issuerTrusted ? '✅' : '❌'}`);
  console.log(`  Score:             ${result1.score}/100`);
  console.log(`  Verified:          ${result1.verified ? '✅ PASSED' : '❌ FAILED'}`);

  // ── Test 3: Pipeline WITHOUT contributor-provided DID ──────────────────
  console.log('\n━━━ Test 3: Verification WITHOUT Contributor-Provided DID (Fallback) ━━━\n');

  const contributorNoDID: Contributor = {
    username: 'test-user',
    githubId: 87654321,
    avatarUrl: 'https://avatars.githubusercontent.com/u/87654321',
    email: 'test@example.com',
    gpgVerified: null,
    didLinked: false,
    // No DID provided — system should fallback to mock
  };

  const result2 = await verifyContributor(contributorNoDID);

  console.log(`  User:              @${contributorNoDID.username}`);
  console.log(`  DID Provided:      ${result2.checks.didProvided ? 'Yes' : 'No ⚠️ (fallback)'}`);
  console.log(`  DID:               ${result2.did}`);
  console.log(`  Method:            ${result2.verificationMethod}`);
  console.log(`  DID Resolved:      ${result2.checks.didResolved ? '✅' : '❌'}`);
  console.log(`  Credential Valid:  ${result2.checks.credentialValid ? '✅' : '❌'}`);
  console.log(`  Issuer Trusted:    ${result2.checks.issuerTrusted ? '✅' : '❌'}`);
  console.log(`  Score:             ${result2.score}/100`);
  console.log(`  Verified:          ${result2.verified ? '✅ PASSED' : '❌ FAILED'}`);

  // ── Test 4: Score comparison ──────────────────────────────────────────
  console.log('\n━━━ Test 4: Score Comparison ━━━\n');
  console.log(`  With DID:    ${result1.score}/100 (method: ${result1.verificationMethod})`);
  console.log(`  Without DID: ${result2.score}/100 (method: ${result2.verificationMethod})`);
  console.log(`  Bonus:       +${result1.score - result2.score} points for providing a DID`);

  // ── Test 5: Simulated Check Run Output ────────────────────────────────
  console.log('\n━━━ Test 5: Simulated GitHub Check Run Output ━━━\n');

  const statusIcon = result1.verified ? '✅' : '❌';
  const checkRunOutput = [
    '## Contributor Identity Verification',
    '',
    `**User:** @${contributorWithDID.username}`,
    `**DID:** \`${result1.did}\``,
    '',
    '### DID Source',
    `- Provided by Contributor: ${result1.checks.didProvided ? 'Yes' : 'No'}`,
    '',
    '### Checks',
    `- DID Resolved: ${result1.checks.didResolved ? '✅' : '❌'}`,
    `- Credential Valid: ${result1.checks.credentialValid ? '✅' : '❌'}`,
    `- Trusted Issuer: ${result1.checks.issuerTrusted ? '✅' : '❌'}`,
    `- DID Provided: ${result1.checks.didProvided ? '✅' : '❌'}`,
    '',
    '### Result',
    `${statusIcon} **${result1.verified ? 'Verification Passed' : 'Verification Failed'}**`,
    '',
    `### Score: ${result1.score}/100`,
  ].join('\n');

  console.log(checkRunOutput);

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('  ALL TESTS COMPLETED');
  console.log('═'.repeat(70) + '\n');
}

runTests().catch(console.error);
