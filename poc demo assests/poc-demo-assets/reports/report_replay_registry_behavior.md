# Replay Registry Behavior Report

**Module:** `src/services/cryptoService.ts`  
**Test File:** `tests/unit/replayRegistry.test.ts`  
**Report Date:** 2026-05-10  

---

## Overview

The replay registry is an in-memory defense mechanism that prevents signature reuse across different commits. It is implemented as a bounded `Map<string, ReplayEntry>` with TTL-based eviction and oldest-first overflow handling.

---

## Architecture

```
                     ┌───────────────────────────┐
                     │   verifyCommitSignature()  │
                     │                           │
  commit + signature ──► SHA-256 fingerprint     │
                     │       │                   │
                     │       ▼                   │
                     │  seenSignatures.get(fp)   │
                     │       │                   │
                     │       ├─ NOT FOUND ──► verify ──► record if valid
                     │       │                   │
                     │       ├─ FOUND + SAME SHA ──► ALLOW (idempotent)
                     │       │                   │
                     │       └─ FOUND + DIFF SHA ──► REJECT (replay attack)
                     │                           │
                     └───────────────────────────┘
```

---

## Behavior Table

| Scenario | Outcome | Reason |
|---|---|---|
| New signature on new commit | ALLOW → record | Normal verification |
| Same signature on same commit | ALLOW | Idempotent re-verification |
| Same signature on different commit | REJECT | Replay attack detected |
| Expired entry re-used | ALLOW | TTL eviction removes old entries |
| Registry at max size | Evict oldest | LRU-like eviction before check |

---

## Configuration

| Parameter | Default | Env Var |
|---|---|---|
| Max entries | 10,000 | `REPLAY_REGISTRY_MAX_SIZE` |
| Entry TTL | 1 hour (3,600,000 ms) | `REPLAY_REGISTRY_TTL_MS` |

---

## Eviction Strategy

1. **Phase 1 — TTL Eviction:** Iterate all entries; delete those older than `REPLAY_REGISTRY_TTL_MS`.
2. **Phase 2 — Overflow Eviction:** If still over `REPLAY_REGISTRY_MAX_SIZE`, sort by creation time and remove the oldest entries until at capacity.

Eviction is **lazy** — it runs on every `verifyCommitSignature()` call before the replay check. There are no background timers or intervals.

---

## Test Coverage (5 tests)

| Test | Assertion |
|---|---|
| Record verified signatures | Registry size increases after valid verification |
| Grow registry with unique sigs | Multiple unique signatures tracked correctly |
| Clear registry | `clearReplayRegistry()` resets size to 0 |
| Idempotent re-verification | Same sig + same commit = ALLOW |
| Cross-commit replay detection | Same sig + different commit = REJECT with "Replay attack" message |

---

## Production Considerations

1. **In-memory only:** The registry does not survive process restarts. In production, this should be Redis or a database table with TTL.
2. **Single-process safe:** No concurrency issues for single Node.js process. For multi-process deployments, a shared store is required.
3. **Signature fingerprinting:** Uses SHA-256 of the raw signature payload as the key. This is collision-resistant and deterministic.
4. **Memory bound:** With max 10,000 entries and ~100 bytes per entry, the registry uses at most ~1MB of memory. This is appropriate for a PoC.

---

## Verdict

The replay registry implementation is **correct, bounded, and well-tested** for a PoC. The design clearly anticipates the production replacement (Redis/DB) and the bounded memory semantics are properly implemented.
