/**
 * Pull Request Webhook Handler
 *
 * Orchestrates the full verification flow when a PR is opened or updated:
 *   1. Extract contributor + PR context from the webhook payload
 *   2. Fetch all PR commits with signature data
 *   3. Run the deterministic verification pipeline
 *   4. Report structured results via GitHub API
 *
 * This is the "glue" layer — it has no business logic of its own.
 * All decisions are made by the verifier service.
 */

import { verifyPullRequest } from '../services/verifier';
import { getGitHubService } from '../services/githubService';
import { resolveDID, resolveDIDDocument, extractVerificationMethod } from '../services/didResolver';
import { config } from '../config';
import { logger } from '../utils/logger';
import { extractDIDFromText } from '../utils/didExtractor';
import { Contributor, PullRequestContext } from '../types/verification';

// ── Payload extraction ────────────────────────────────────────────────────

/**
 * Build a Contributor from the webhook payload.
 * Extracts contributor-provided DID from PR body/title if present.
 */
function extractContributor(payload: any): Contributor {
  const user = payload.pull_request.user;
  const pr = payload.pull_request;

  const providedDid = extractDIDFromText(pr.body) ?? extractDIDFromText(pr.title);

  if (providedDid) {
    logger.info('🪪 DID EXTRACTED', {
      did: providedDid,
      source: extractDIDFromText(pr.body) ? 'pr_body' : 'pr_title',
    });
  } else {
    logger.info('🪪 DID: none provided — using fallback');
  }

  return {
    username: user.login,
    githubId: user.id,
    avatarUrl: user.avatar_url,
    email: user.email ?? null,
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
    prBody: payload.pull_request.body ?? null,
    prTitle: payload.pull_request.title,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────

/**
 * Handle pull_request events.
 *
 * Flow:
 *   1. Extract PR context + contributor info
 *   2. Resolve DID → get public key (needed for mock signature generation)
 *   3. Fetch PR commits with signatures
 *   4. Run verification pipeline
 *   5. Post results to GitHub
 */
export async function handlePullRequestOpened(
  event: any,
  githubToken: string
): Promise<void> {
  try {
    const context = extractPRContext(event.payload);
    const github = getGitHubService(githubToken);

    // ── Resolve DID early to get public key for commit fetching ────────
    // The GitHub service needs the public key to generate mock signatures
    // that the crypto service can verify. In production, this step would
    // not be needed — real signatures come from the commits themselves.
    const didResult = resolveDID(context.contributor.username, context.contributor.did);
    let publicKeyBase58: string | undefined;

    if (didResult.did) {
      const docResult = resolveDIDDocument(didResult.did);
      if (docResult.document) {
        const vm = extractVerificationMethod(docResult.document);
        publicKeyBase58 = vm?.publicKeyBase58;
      }
    }

    // ── Fetch PR commits with signature data ──────────────────────────
    const commits = await github.fetchPRCommits(
      context.repoOwner,
      context.repoName,
      context.prNumber,
      didResult.did ?? undefined,
      publicKeyBase58
    );

    logger.info('📦 COMMITS FETCHED', {
      count: commits.length,
      shas: commits.map((c) => c.commitSha.slice(0, 7)),
    });

    // ── Run the verification pipeline ─────────────────────────────────
    const result = await verifyPullRequest(context, commits);

    // ── Report results to GitHub ──────────────────────────────────────
    if (config.ENABLE_CHECK_RUNS) {
      await github.createCheckRun(
        context.repoOwner,
        context.repoName,
        context.headSha,
        context.contributor.username,
        result
      );
    }

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
    // Don't re-throw — webhook response must succeed even if pipeline fails.
  }
}
