/**
 * Pull Request Webhook Handler
 *
 * Orchestrates the full verification flow when a PR is opened or updated:
 *   1. Extract contributor + PR context from the webhook payload
 *   2. Run the verification pipeline (DID → credential → checks)
 *   3. Report results via GitHub Check Run and/or PR comment
 *
 * This is the "glue" layer — it has no business logic of its own.
 */

import { verifyContributor } from '../services/verifier';
import { getGitHubService } from '../services/githubService';
import { config } from '../config';
import { logger } from '../utils/logger';
import { extractDIDFromText } from '../utils/didExtractor';
import { Contributor, PullRequestContext } from '../types/contributor';

// ── Payload extraction helpers ────────────────────────────────────────────

/**
 * Build a Contributor from the webhook payload.
 *
 * If the contributor has included a DID in the PR body or title, we extract
 * and attach it here. Priority: PR body → PR title (body is more likely to
 * contain structured metadata).
 *
 * FUTURE: Also fetch the contributor's linked DID from a profile service
 *         or on-chain registry before handing off to the pipeline.
 */
function extractContributor(payload: any): Contributor {
  const user = payload.pull_request.user;
  const pr = payload.pull_request;

  // ── Extract contributor-provided DID ──────────────────────────────────
  // Check PR body first (more room for structured metadata), then title
  const providedDid = extractDIDFromText(pr.body) ?? extractDIDFromText(pr.title);

  if (providedDid) {
    logger.info('🪪 DID EXTRACTED', { did: providedDid, source: extractDIDFromText(pr.body) ? 'pr_body' : 'pr_title' });
  } else {
    logger.info('🪪 DID: none provided — using fallback');
  }

  return {
    username: user.login,
    githubId: user.id,
    avatarUrl: user.avatar_url,

    // Email may be null if the contributor's profile is private
    email: user.email ?? null,

    // We don't know GPG status from the webhook payload itself — this would
    // come from inspecting the commits via the GitHub API (future enhancement).
    gpgVerified: null,

    // Will be set to true once the DID resolver runs inside the pipeline.
    didLinked: false,

    // Contributor-provided DID extracted from PR metadata (if any)
    did: providedDid ?? undefined,
  };
}

/**
 * Build full PR context from the webhook payload.
 */
function extractPRContext(payload: any): PullRequestContext {
  return {
    prNumber: payload.pull_request.number,
    repoOwner: payload.repository.owner.login,
    repoName: payload.repository.name,
    headSha: payload.pull_request.head.sha,
    contributor: extractContributor(payload),
    prUrl: payload.pull_request.html_url,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────

/**
 * Handle pull_request.opened and pull_request.synchronize events.
 */
export async function handlePullRequestOpened(
  event: any,
  githubToken: string
): Promise<void> {
  try {
    const context = extractPRContext(event.payload);

    // Stage header already logged in handler.ts

    // ── Run the verification pipeline ─────────────────────────────────
    const result = await verifyContributor(context.contributor);

    // ── Report results to GitHub ──────────────────────────────────────
    const github = getGitHubService(githubToken);

    // Primary: Check Run (shows on PR Checks tab)
    if (config.ENABLE_CHECK_RUNS) {
      await github.createCheckRun(
        context.repoOwner,
        context.repoName,
        context.headSha,
        context.contributor.username,
        result
      );
    }

    // Optional: legacy PR comment
    if (config.ENABLE_PR_COMMENTS) {
      await github.postVerificationComment(
        context.repoOwner,
        context.repoName,
        context.prNumber,
        context.contributor.username,
        result
      );
    }

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    logger.error('Error handling PR event', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Don't re-throw — we want the webhook response to succeed even
    // if the verification pipeline or GitHub API call fails.
  }
}
