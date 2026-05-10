# pr-identity-verifier

> Cryptographic contributor identity verification for GitHub pull requests — built for the Linux Foundation Decentralized Trust (LFDT) ecosystem.

A production-transition prototype that verifies contributor identity at the commit level using **Decentralized Identifiers (DIDs)**, **Verifiable Credentials (VCs)**, and **Ed25519 commit signature verification**. Designed as the foundation for live integration with the **Heka Identity Platform**, **Hedera DID**, and **Credo-ts**.

[![Tests](https://img.shields.io/badge/tests-113%20passing-brightgreen)](#testing)
[![Status](https://img.shields.io/badge/status-production--transition-blue)](#current-state-vs-production)
[![License](https://img.shields.io/badge/license-MIT-gray)](#license)

---

## What This Is

Standard GitHub identity (username + OAuth) is spoofable. An attacker who clones a contributor's identity — or an AI agent submitting PRs at scale — bypasses every code review layer that doesn't verify *who actually signed the commit*.

This project intercepts pull request events and runs a deterministic cryptographic verification pipeline:

1. Extract DID from PR body or title
2. Resolve DID Document → extract public key
3. Verify each commit signature against that key (Ed25519)
4. Validate Verifiable Credential + issuer trust
5. Report result as a GitHub Check Run + structured PR comment

**Live Hedera DID resolution and Heka integration are the intended LFX mentorship deliverables.** The architecture is already wired for them.

---

## Demo

> End-to-end verification validated through a live GitHub webhook flow using ngrok, real PR events, and Ed25519 commit signature verification.

**Verification Pipeline**
![Verification Pipeline](./poc-demo-assets/screenshots/verification-pipeline.png)

**Live Webhook Delivery**
![Webhook Delivery](./poc-demo-assets/screenshots/ngrok-webhook.png)

[▶ Watch Demo Video](./poc-demo-assets/demo-video.mp4)

---

## Features

| | |
|---|---|
| ✅ Real Ed25519 cryptography | via `@noble/ed25519` — no mocked crypto |
| ✅ Replay attack protection | SHA-bound signature registry with TTL eviction |
| ✅ GitHub App authentication | `@octokit/app` — JWT + installation-scoped tokens |
| ✅ Deterministic verification pipeline | HARD_FAIL / SOFT_FAIL / SUCCESS classification |
| ✅ 113 passing tests | unit, integration, adversarial, and concurrency |
| ✅ Credo-ts + Hedera DID architecture | wired and ready for live integration |
| ✅ Structured PR output | Check Run + per-commit verification report |

---

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│                   GitHub Webhook                    │
│   pull_request.opened / pull_request.synchronize   │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                  Webhook Handler                    │
│   HMAC-SHA256 signature verification                │
│   Extract PR context, contributor info, DID         │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              Verification Pipeline                  │
│                                                     │
│  DID Resolver → Crypto Service → Credential Service │
│                                                     │
│  For each commit:                                   │
│    1. Extract signature                             │
│    2. Verify against DID public key (Ed25519)       │
│    3. Validate VC + issuer trust                    │
│    4. Classify: SUCCESS | HARD_FAIL | SOFT_FAIL     │
│                                                     │
│  Aggregate: ANY commit fails → entire PR fails      │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                  GitHub Output                      │
│   Check Run + structured PR comment                 │
└─────────────────────────────────────────────────────┘
```

### Module Map

| Module | Responsibility | Production Target |
|--------|---------------|-------------------|
| `crypto/ed25519.ts` | Real Ed25519 signing + verification | Production-ready |
| `services/cryptoService.ts` | Verification + replay protection | Uses real crypto in `real_crypto` mode |
| `services/didResolver.ts` | DID validation + document resolution | → Credo-ts Hedera resolver |
| `services/credentialService.ts` | VC issuance + trust validation | → Heka OID4VP endpoint |
| `services/verifier.ts` | Pipeline orchestration | Core layer |
| `auth/githubApp.ts` | GitHub App JWT + installation auth | Production-ready |
| `experimental/credoAgent.ts` | Credo-ts + Hedera DID architecture | → Live integration |

---

## Verification Model

### Failure Classification

| Status | Meaning |
|--------|---------|
| `SUCCESS` | Cryptographic proof of identity |
| `HARD_FAIL` | Cryptographic proof of *incorrectness* |
| `SOFT_FAIL` | Unable to determine identity |

### Aggregation Rules

```
ANY commit HARD_FAIL  →  PR is HARD_FAIL
ANY commit SOFT_FAIL  →  PR is SOFT_FAIL   (no HARD_FAIL present)
ALL commits SUCCESS   →  PR is SUCCESS
```

### Verification Modes

| Mode | Crypto | Use Case |
|------|--------|----------|
| `simulated` | SHA-256 comparison | Deterministic testing |
| `real_crypto` | Ed25519 | Production-transition validation |

---

## Current State vs Production

| Component | Current (PoC) | Production Target |
|-----------|--------------|-------------------|
| Crypto Verification | ✅ Real Ed25519 + simulated mode | Credo-ts delegated verification |
| DID Resolution | Deterministic simulated resolver | Hedera DID via HCS |
| VC Validation | Simulated validation | Heka OID4VP |
| GitHub Auth | App architecture implemented | Deployed GitHub App |
| Replay Protection | In-memory bounded registry | Redis/database-backed |
| Trust Registry | Static trusted issuers | Dynamic Heka trust registry |
| Contributor Onboarding | Not implemented | Heka Web UI onboarding |

---

## Security Design

| Threat | Mitigation | Status |
|--------|-----------|--------|
| DID spoofing | Signature verification against DID public key | ✅ Tested |
| Signature forgery | Real Ed25519 verification | ✅ Tested |
| Credential tampering | Proof integrity validation | ✅ Tested |
| Replay attacks | SHA-bound signature registry | ✅ Tested |
| DID injection | Regex + DID syntax validation | ✅ Tested |
| Webhook forgery | HMAC-SHA256 verification | ✅ Implemented |
| Token leakage | Installation-scoped GitHub App tokens | ✅ Architecture |

### Replay Protection

Each signature is bound to its commit SHA:

```
Signature S for commit C₁  →  ACCEPT
Signature S reused for C₂  →  REJECT
Signature S reused for C₁  →  ACCEPT  (same commit, not a replay)
```

Registry protections: bounded size, TTL eviction, oldest-first cleanup.

---

## Testing

```bash
npm test
```

**113 tests passing.**

| Category | Tests |
|----------|-------|
| Unit | 71 |
| Integration | 13 |
| Adversarial | 11 |
| Concurrency | 4 |

Security guarantees covered: DID spoofing detection, replay prevention, credential tampering detection, wrong-key rejection, malformed crypto input handling.

---

## Setup

```bash
git clone https://github.com/cynox-66/pr-identity-verifier.git
cd pr-identity-verifier
npm install
cp .env.example .env
```

```bash
npm run dev     # development
npm run build   # production build
npm start       # start server
```

---

## Example PR Output

**Verified contributor:**

```
## 🔐 Identity Verification Report
| Field       | Value               |
|-------------|---------------------|
| Contributor | @alice              |
| DID         | did:key:z6MkhaXg... |
| Status      | ✅ VERIFIED         |
| Commits     | 3/3 passed          |
```

**Spoofed identity detected:**

```
## 🔐 Identity Verification Report
| Field       | Value                            |
|-------------|----------------------------------|
| Contributor | @eve                             |
| DID         | did:web:example.com:users:alice  |
| Status      | ❌ FAILED                        |
| Commits     | 0/1 passed                       |

Signature does not match DID public key.
Possible identity spoofing detected.
```

---

## Production Roadmap

LFX Mentorship integration milestones:

- [ ] Replace mock DID resolution with `@credo-ts/hedera`
- [ ] Replace mock VC validation with Heka OID4VP
- [ ] Deploy GitHub App with installation-token auth
- [ ] Build contributor onboarding in Heka Identity Platform
- [ ] Deploy live verification flow in Hiero repositories

---

## License

MIT
