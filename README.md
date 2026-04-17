# PR Identity Verifier

A GitHub App that verifies contributor identity using **Decentralized Identifiers (DIDs)** and **Verifiable Credentials (VCs)** — integrated directly into the Pull Request workflow.

When a PR is opened or updated, the system runs a structured verification pipeline and reports results via **GitHub Checks API**, right on the PR's Checks tab.

---

## ✨ What It Does

```
PR Opened → Extract Contributor Info → Resolve DID → Issue Credential → Run Checks → Report on PR
```

1. **Listens** to `pull_request.opened` and `pull_request.synchronize` webhooks
2. **Extracts** contributor metadata from the webhook payload
3. **Resolves** a DID for the contributor (contributor-provided or mock fallback)
4. **Issues** a mock Verifiable Credential
5. **Runs** a multi-check verification pipeline (DID resolved, credential valid, issuer trusted, DID provided)
6. **Reports** structured results via GitHub Check Run with a verification score

---

## 🔑 Contributor-Provided DIDs

Contributors can supply their own DID directly in the **PR body** or **PR title**:

```
DID: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
```

The system will:
- **Extract** the DID using regex matching (`did:key:...` or `did:web:...`)
- **Use it** in the verification pipeline instead of a mock DID
- **Report** the DID source (contributor-provided vs fallback) in the Check Run output
- **Award** bonus score points for providing a DID (+20 pts)

If no DID is provided, the system falls back to generating a mock `did:web` identifier.

---

## 📊 Verification Pipeline

| Check | Weight | Description |
|-------|--------|-------------|
| DID Resolved | 30 pts | DID resolver returned a valid document |
| Credential Valid | 30 pts | Verifiable Credential passes validation |
| Issuer Trusted | 20 pts | Credential issuer is on the trusted list |
| DID Provided | 20 pts | Contributor supplied their own DID |

**Total: 100 pts** — Default passing threshold: **60 pts**

### Example Check Run Output

```
## Contributor Identity Verification

**User:** @alice
**DID:** did:key:z6MkhaXgBZDvotDkL

### DID Source
- Provided by Contributor: Yes

### Checks
- DID Resolved: ✅
- Credential Valid: ✅
- Trusted Issuer: ❌
- DID Provided: ✅

### Result
❌ Verification Failed

### Score: 80/100
```

---

## 🏗 Architecture

```
src/
├── index.ts                    # Express server bootstrap
├── config.ts                   # Environment-driven configuration
├── webhook/
│   ├── handler.ts              # Webhook event router
│   └── pullRequest.ts          # PR event → verification pipeline orchestration
├── services/
│   ├── didService.ts           # DID resolution (mock + contributor-provided)
│   ├── credentialService.ts    # VC issuance & validation (mock)
│   ├── githubService.ts        # GitHub Checks API + PR comments
│   └── verifier.ts             # Verification pipeline & scoring
├── types/
│   └── contributor.ts          # Domain types (Contributor, DIDDocument, VC, etc.)
└── utils/
    ├── logger.ts               # Structured logging
    └── didExtractor.ts         # DID extraction from PR metadata
```

### Data Flow

```
Webhook Payload
    │
    ▼
pullRequest.ts ──── extractDIDFromText() ──── didExtractor.ts
    │
    ▼
verifier.ts
    ├── resolveDID()          ← didService.ts (uses provided DID or mock)
    ├── getDIDDocument()      ← didService.ts
    ├── issueCredential()     ← credentialService.ts
    ├── validateCredential()  ← credentialService.ts
    ├── isIssuerTrusted()     ← credentialService.ts
    └── compute score & result
    │
    ▼
githubService.ts ──── createCheckRun() ──── GitHub Checks API
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A **GitHub App** or Personal Access Token with `checks:write` permission
- **ngrok** (or similar) to expose localhost for webhooks

### Setup

```bash
# Clone
git clone https://github.com/cynox-66/pr-identity-verifier.git
cd pr-identity-verifier

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your GitHub token and webhook secret
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_WEBHOOK_SECRET` | ✅ | — | Webhook secret for signature verification |
| `GITHUB_TOKEN` | ✅ | — | GitHub token with `checks:write` scope |
| `PORT` | — | `3000` | Server port |
| `MIN_VERIFICATION_SCORE` | — | `60` | Minimum score to pass verification |
| `ENABLE_CHECK_RUNS` | — | `true` | Create Check Runs on PRs |
| `ENABLE_PR_COMMENTS` | — | `false` | Post legacy PR comments |
| `DID_DOMAIN` | — | `example.com` | Domain for mock `did:web` identifiers |
| `CREDENTIAL_ISSUER` | — | `did:web:issuer.example` | Mock credential issuer DID |
| `TRUSTED_ISSUERS` | — | `did:web:issuer.example` | Comma-separated trusted issuer DIDs |

### Run

```bash
# Development (with ts-node)
npm run dev

# Production
npm run build
npm start

# Type check only
npm run typecheck
```

### Expose for GitHub Webhooks

```bash
ngrok http 3000
```

Then configure your GitHub App's webhook URL to:
```
https://<ngrok-id>.ngrok-free.app/webhooks/github
```

---

## 🧪 Testing the DID Flow

1. Open a PR on a repo with this app installed
2. Include a DID in the PR body:
   ```
   DID: did:key:z6MkTest123abc
   ```
3. The Check Run will show:
   - **DID Source → Provided by Contributor: Yes**
   - The provided DID used throughout the pipeline
   - +20 bonus score for providing a DID

4. Open a PR _without_ a DID → system falls back to mock DID, score capped at 80

---

## 🔮 Future Roadmap

This PoC uses mock/simulated DID and VC logic. The architecture is designed for clean replacement with real implementations:

| Component | Current (Mock) | Future (Real) |
|-----------|---------------|---------------|
| DID Resolution | Generate `did:web` from username | Universal DID resolver (did:webvh, did:key, did:ion) |
| DID Document | In-memory mock document | Fetch from `.well-known` or DID method endpoint |
| DID Extraction | Regex from PR body/title | GitHub profile lookup, pinned gist, `.well-known` |
| Credential Issuance | Always-valid mock VC | Real VC issuer (Trinsic, SpruceID) with Ed25519 signatures |
| Credential Validation | Read `valid` flag | Verify cryptographic proof, check revocation |
| Trust Registry | Static issuer list | Query OpenVTC, TRAIN, or governance framework |
| Scoring | Fixed 4-check weights | Configurable per-org with reputation signals |

---

#Test number - 3
