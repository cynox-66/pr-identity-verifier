# PR Identity Verifier

**Deterministic DID-based identity verification for GitHub pull requests.**

A production-transition prototype that cryptographically verifies contributor identity at the commit level using Decentralized Identifiers (DIDs), Verifiable Credentials (VCs), and commit signature verification. Built for the [Linux Foundation Decentralized Trust](https://www.lfdecentralizedtrust.org/) (LFDT) ecosystem.

> **Status:** Production-transition prototype. Core verification pipeline is fully functional.
> Real Ed25519 cryptography is implemented alongside the deterministic simulation mode.
> Hedera DID and Heka integration architecture is designed; live integration is the LFX mentorship deliverable.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        GitHub Webhook                            │
│  pull_request.opened / pull_request.synchronize                  │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Webhook Handler                              │
│  HMAC-SHA256 signature verification                              │
│  Extract PR context, contributor info, DID from PR body/title    │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Verification Pipeline                          │
│                                                                  │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │  DID Resolver   │→│  Crypto Service   │→│ Credential Svc  │  │
│  │                 │  │                  │  │                 │  │
│  │ • Validate DID  │  │ • Verify commit  │  │ • Issue VC      │  │
│  │ • Resolve Doc   │  │   signatures vs  │  │ • Validate proof│  │
│  │ • Extract keys  │  │   DID public key │  │ • Check issuer  │  │
│  │                 │  │ • Replay protect │  │   trust         │  │
│  └────────────────┘  └──────────────────┘  └─────────────────┘  │
│                                                                  │
│  Mode: simulated (SHA-256) or real_crypto (Ed25519)              │
│                                                                  │
│  For EACH commit:                                                │
│    1. Extract signature                                          │
│    2. Verify against DID public key                              │
│    3. Validate credential                                        │
│    4. Classify: SUCCESS | HARD_FAIL | SOFT_FAIL                  │
│                                                                  │
│  Aggregate: ANY commit fails → entire PR fails                   │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                      GitHub Output                               │
│  • Check Run with verification report (GitHub App auth)          │
│  • Structured PR comment with per-commit results                 │
└──────────────────────────────────────────────────────────────────┘
```

### Module Separation

| Module | Responsibility | Production Target |
|---|---|---|
| `crypto/ed25519.ts` | **Real** Ed25519 key generation, signing, verification | Production-ready (`@noble/ed25519`) |
| `services/cryptoService.ts` | Simulated verification + bounded replay registry | → `crypto/ed25519.ts` in `real_crypto` mode |
| `services/didResolver.ts` | DID validation, document resolution, key extraction | → Credo-ts `@credo-ts/hedera` |
| `services/credentialService.ts` | VC issuance, proof validation, issuer trust | → Heka OID4VP endpoint |
| `services/verifier.ts` | Pipeline orchestration, aggregation, classification | Core (not replaceable) |
| `auth/githubApp.ts` | GitHub App JWT + installation token auth | Production-ready (`@octokit/app`) |
| `experimental/credoAgent.ts` | Credo-ts agent architecture + Hedera DID config | → Live Credo agent in LFX mentorship |

---

## Current State vs. Production Integration

| Component | Current (PoC) | Production (LFX Mentorship) |
|---|---|---|
| **Crypto Verification** | ✅ Real Ed25519 via `@noble/ed25519` + simulated mode | Delegated to Credo-ts agent |
| **DID Resolution** | Simulated (deterministic mock documents) | `@credo-ts/hedera` → Hedera HCS resolution |
| **VC Validation** | Simulated (self-issued, self-verified) | Heka OID4VP endpoint |
| **GitHub Auth** | ✅ `@octokit/app` architecture (JWT + installation tokens) | Deployed GitHub App |
| **Replay Protection** | ✅ Bounded in-memory registry with TTL eviction | Redis/DB with TTL |
| **Trust Registry** | Static env var list | Dynamic Heka trust registry query |
| **DID Cache** | ✅ Configurable TTL + max size | Same, tuned for Hedera HCS latency |
| **Contributor Onboarding** | Not implemented | Heka Web UI (4-step flow) |
| **Linked VP Discovery** | Not implemented | DID Document service endpoint |

---

## Verification Model

### Failure Classification

| Status | Meaning | Trigger Conditions |
|---|---|---|
| `SUCCESS` | Cryptographic proof of identity | All commits verified, credential valid, issuer trusted |
| `HARD_FAIL` | Cryptographic proof of **incorrectness** | Signature mismatch, invalid DID, credential tampered, replay detected |
| `SOFT_FAIL` | Cannot determine identity | Unsigned commits, resolver unavailable, empty PR, missing data |

### Aggregation Rule

```
If ANY commit is HARD_FAIL → PR is HARD_FAIL
If ANY commit is SOFT_FAIL (and none HARD_FAIL) → PR is SOFT_FAIL
If ALL commits are SUCCESS → PR is SUCCESS
```

### Why Deterministic Classification

Heuristic scores are fundamentally broken for identity verification:
- A score of 80/100 tells you nothing — is the identity valid or not?
- Scores create false confidence: "almost verified" is unverified
- Scores can be gamed by optimizing for weight distribution

Deterministic classification gives actionable answers:
- `SUCCESS` = merge with confidence
- `HARD_FAIL` = block and investigate
- `SOFT_FAIL` = request additional verification

> **Note:** The LFX mentorship production system uses a weighted scoring model
> (6-check pipeline with threshold ≥60) for gradual adoption during the
> ecosystem's transition to SSI. This PoC demonstrates the strict deterministic
> model; the scoring model is an intentional design evolution for production.

---

## Real Cryptography

This repository includes **real Ed25519 cryptographic operations** via `@noble/ed25519` — a zero-dependency, audited implementation.

### What Is Real

```
src/crypto/ed25519.ts:
  ✅ Ed25519 keypair generation (random + deterministic from seed)
  ✅ Ed25519 message signing (64-byte signatures)
  ✅ Ed25519 signature verification
  ✅ Commit-SHA-bound signature verification
  ✅ Hex encoding/decoding utilities
  ✅ Input validation (length, format, malformed data)

25 tests covering:
  ✅ Key generation correctness
  ✅ Sign-and-verify round trip
  ✅ Tampered message detection
  ✅ Wrong key detection (identity spoofing)
  ✅ Malformed input handling
  ✅ Edge cases (empty inputs, wrong lengths, bad hex)
```

### Verification Modes

| Mode | Config | Crypto | Use Case |
|---|---|---|---|
| `simulated` (default) | `VERIFICATION_MODE=simulated` | SHA-256 hash comparison | Testing, demo, deterministic |
| `real_crypto` | `VERIFICATION_MODE=real_crypto` | Ed25519 via @noble/ed25519 | Production-transition proof |

---

## GitHub App Authentication

The PoC includes a production-correct GitHub App authentication architecture via `@octokit/app`:

```
src/auth/githubApp.ts:
  ✅ GitHub App initialization (JWT + private key)
  ✅ Installation-scoped Octokit instances
  ✅ Auto-rotating installation access tokens
  ✅ Installation ID extraction from webhook payloads

app.yml:
  ✅ Permission manifest (checks:write, pull_requests:read, contents:read)
  ✅ Webhook event subscriptions (pull_request, issue_comment)
```

> **Note:** The current webhook handler still uses a PAT for API calls.
> The `auth/githubApp.ts` module provides the production architecture
> that replaces PAT-based auth with proper GitHub App installation tokens.

---

## Experimental: Credo-ts + Hedera DID

The `experimental/` directory contains the Credo-ts agent architecture for Hedera DID resolution:

```
src/experimental/credoAgent.ts:
  ✅ Correct Credo-ts agent configuration pattern
  ✅ HederaModule + HederaDidResolver setup
  ✅ Hedera mirror node configuration (mainnet/testnet/previewnet)
  ✅ DID resolution flow (HCS message replay)
  ✅ Verifier-only agent mode (no wallet, no issuance)
```

This module demonstrates the exact integration pattern used by `heka-identity-service`.
Full live Hedera DID resolution is the primary LFX mentorship deliverable.

---

## Security Design

### Threat Model

| Threat | Mitigation | Status |
|---|---|---|
| **DID Spoofing** | Signature verification binds DID to commit | ✅ Tested |
| **Signature Forgery** | Real Ed25519 verification (or simulated equivalent) | ✅ Tested |
| **Credential Tampering** | Proof integrity + subject binding check | ✅ Tested |
| **Replay Attacks** | SHA-bound signature registry with TTL eviction | ✅ Tested |
| **DID Injection** | Regex validation + W3C DID syntax enforcement | ✅ Tested |
| **Registry Memory Leak** | Bounded size + TTL eviction (configurable) | ✅ Implemented |
| **Webhook Forgery** | HMAC-SHA256 signature verification (@octokit/webhooks) | ✅ Implemented |
| **Token Leakage** | GitHub App installation tokens (auto-rotating, scoped) | ✅ Architecture |

### Replay Protection

Each signature is bound to its commit SHA:

```
Signature S used to verify commit C₁
If S reused for commit C₂ (C₂ ≠ C₁) → REJECT (replay attack)
If S reused for commit C₁ again → ACCEPT (idempotent re-verification)
```

The replay registry is bounded:
- **Max entries:** 10,000 (configurable via `REPLAY_REGISTRY_MAX_SIZE`)
- **Entry TTL:** 1 hour (configurable via `REPLAY_REGISTRY_TTL_MS`)
- **Eviction:** Lazy (on check), oldest-first when over capacity

---

## Setup

### Prerequisites

- Node.js 18+
- GitHub App with webhook configured (or PAT for development)

### Installation

```bash
git clone https://github.com/cynox-66/pr-identity-verifier.git
cd pr-identity-verifier
npm install
cp .env.example .env
# Edit .env with your GitHub credentials
```

### Configuration

| Variable | Description | Default |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | Webhook secret for HMAC verification | Required |
| `GITHUB_TOKEN` | GitHub token for API access | Required |
| `VERIFICATION_MODE` | `simulated` or `real_crypto` | `simulated` |
| `ENABLE_CHECK_RUNS` | Create GitHub Check Runs | `true` |
| `ENABLE_PR_COMMENTS` | Post PR comments with results | `false` |
| `REQUIRE_COMMIT_SIGNATURES` | Unsigned = HARD_FAIL | `false` |
| `MAX_COMMITS_PER_PR` | Safety limit | `250` |
| `REPLAY_REGISTRY_MAX_SIZE` | Max replay registry entries | `10000` |
| `REPLAY_REGISTRY_TTL_MS` | Replay entry TTL (ms) | `3600000` |
| `DID_CACHE_TTL_MS` | DID Document cache TTL (ms) | `300000` |

### Running

```bash
npm run dev          # Development (ts-node)
npm run build        # Compile TypeScript
npm start            # Production (compiled JS)
npm run typecheck    # Type checking only
```

---

## Testing

### Test Suite

```bash
npm test                    # Run all tests (113 total)
npm run test:unit           # Unit tests (71 tests)
npm run test:integration    # Integration tests (13 tests)
npm run test:adversarial    # Security/attack tests (11 tests + DID spoofing)
npm run test:concurrency    # Parallel load tests (4 tests)
npm run test:coverage       # With coverage report
```

### Test Categories

| Category | Tests | What They Prove |
|---|---|---|
| **Unit** | 71 | Module correctness (DID, crypto, credentials, extractor, **Ed25519**, replay registry) |
| **Integration** | 13 | Full pipeline (DID → signature → credential → result) |
| **Adversarial** | 11 | System guarantees (spoofing, forgery, replay, injection, tampering) |
| **Concurrency** | 4 | Correctness under parallel load (rapid commits, concurrent PRs) |
| **Total** | **113** | |

### Key Security Guarantees (Tested)

- ✅ DID spoofing detected (attacker claims another's DID → signature mismatch)
- ✅ Fabricated signatures rejected (both simulated and real Ed25519)
- ✅ Credential tampering detected (modified proof, subject swap, removed proof)
- ✅ Replay attacks blocked (cross-commit signature reuse → REJECT)
- ✅ DID injection prevented (path traversal, script injection → HARD_FAIL)
- ✅ Tampered message detection (single byte change → verification failure)
- ✅ Wrong key detection (Eve's key vs Alice's DID → HARD_FAIL)
- ✅ Malformed crypto input handling (wrong lengths, bad hex, empty data)

---

## Example PR Output

### SUCCESS

```
## 🔐 Identity Verification Report

| Field | Value |
|---|---|
| **Contributor** | @alice |
| **DID** | `did:key:z6MkhaXg...` |
| **Status** | 🟢 **VERIFIED** |
| **Commits** | 3/3 passed |

### 🔍 Per-Commit Results

| Commit | Signature | Credential | Status | Reason |
|---|---|---|---|---|
| `a1b2c3d` | ✅ | ✅ | 🟢 SUCCESS | Verified against DID public key |
| `d4e5f6a` | ✅ | ✅ | 🟢 SUCCESS | Verified against DID public key |
| `7b8c9d0` | ✅ | ✅ | 🟢 SUCCESS | Verified against DID public key |
```

### HARD_FAIL (Identity Spoofing Detected)

```
## 🔐 Identity Verification Report

| Field | Value |
|---|---|
| **Contributor** | @eve |
| **DID** | `did:web:example.com:users:alice` |
| **Status** | 🔴 **FAILED** |
| **Commits** | 0/1 passed |

### ⚠️ Failure Details

> `a1b2c3d` — 🔴 HARD_FAIL
> Signature does not match DID public key — possible identity spoofing
```

---

## Production Roadmap

This prototype is designed for the [LFX Mentorship 2026](https://mentorship.lfx.linuxfoundation.org/) — Hiero Contributor Identity Verification. The production integration path:

1. **Replace mock DID resolution** with `@credo-ts/hedera` (Hedera HCS)
2. **Replace mock VC validation** with Heka OID4VP endpoint
3. **Deploy GitHub App** with `@octokit/app` installation token auth
4. **Build contributor onboarding** in Heka Identity Platform Web UI
5. **Deploy to Hiero repository** for live verification demo

---

## License

MIT
