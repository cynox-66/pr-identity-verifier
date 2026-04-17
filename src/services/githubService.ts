/**
 * GitHub API Service
 *
 * All GitHub API interactions are centralized here:
 *   - Creating Check Runs with structured markdown output
 *   - Posting PR comments (legacy / optional)
 *   - Fetching PR metadata
 *
 * The Check Run output is the primary way verification results reach
 * the contributor — it appears inline on the PR's "Checks" tab.
 *
 * FUTURE: Use GitHub App installation tokens (JWT → installation token)
 *         instead of a personal access token for production use.
 */

import { Octokit } from '@octokit/rest';
import { VerificationResult } from '../types/contributor';
import { logger } from '../utils/logger';

class GitHubService {
  private client: Octokit;

  constructor(token: string) {
    this.client = new Octokit({ auth: token });
  }

  // ── Check Runs ──────────────────────────────────────────────────────────

  /**
   * Create a GitHub Check Run with structured verification output.
   *
   * The "output" object supports GitHub-flavoured Markdown so we can
   * render a nicely formatted identity verification report directly
   * on the PR Checks tab.
   */
  async createCheckRun(
    owner: string,
    repo: string,
    headSha: string,
    username: string,
    result: VerificationResult
  ): Promise<void> {
    try {
      const conclusion = result.verified ? 'success' : 'failure';
      const statusIcon = result.verified ? '✅' : '❌';

      // ── Build structured markdown for the Checks tab ───────────────
      const summary = [
        `${statusIcon} **${result.verified ? 'Verified Contributor' : 'Verification Failed'}**`,
        '',
        `**Score:** ${result.score}/100`,
        '',
        `**DID:** \`${result.did}\``,
        `**Verification Method:** \`${result.verificationMethod}\``,
      ].join('\n');

      const text = [
        '## Contributor Identity Verification',
        '',
        `**User:** @${username}`,
        `**DID:** \`${result.did}\``,
        '',
        '### DID Source',
        `- Provided by Contributor: ${result.checks.didProvided ? 'Yes' : 'No'}`,
        '',
        '### Checks',
        `- DID Resolved: ${result.checks.didResolved ? '✅' : '❌'}`,
        `- Credential Valid: ${result.checks.credentialValid ? '✅' : '❌'}`,
        `- Trusted Issuer: ${result.checks.issuerTrusted ? '✅' : '❌'}`,
        `- DID Provided: ${result.checks.didProvided ? '✅' : '❌'}`,
        '',
        '### Result',
        `${statusIcon} **${result.verified ? 'Verification Passed' : 'Verification Failed'}**`,
        '',
        `### Score: ${result.score}/100`,
        '',
        '---',
        `*Timestamp:* ${result.timestamp}`,
        `*Method:* \`${result.verificationMethod}\``,
      ].join('\n');

      await this.client.checks.create({
        owner,
        repo,
        name: 'Contributor Identity Verification',
        head_sha: headSha,
        status: 'completed' as const,
        conclusion: conclusion as 'success' | 'failure',
        output: {
          title: 'Contributor Identity Verification',
          summary,
          text,
        },
      });

      logger.info('GitHub Check Run created', {
        owner,
        repo,
        headSha,
        conclusion,
        score: result.score,
      });
    } catch (error) {
      logger.error('Failed to create Check Run', {
        owner,
        repo,
        headSha,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ── PR Comments (idempotent — updates existing comment if found) ─────────

  /** Marker used to identify our bot comments so we can update instead of spam */
  private static readonly COMMENT_MARKER = '<!-- did-verification-result -->';

  /**
   * Post or update a PR comment with verification results.
   *
   * Idempotent: searches for an existing comment with our marker and updates
   * it in place. Only creates a new comment if none exists. This prevents
   * duplicate comments when a PR is edited multiple times.
   */
  async postVerificationComment(
    owner: string,
    repo: string,
    prNumber: number,
    username: string,
    result: VerificationResult
  ): Promise<void> {
    try {
      const statusIcon = result.verified ? '✅' : '❌';

      const body = [
        GitHubService.COMMENT_MARKER,
        `## 🔐 Contributor Identity Verification`,
        '',
        `**User:** @${username}`,
        `**DID:** \`${result.did}\``,
        `**Status:** ${statusIcon} ${result.verified ? 'VERIFIED' : 'VERIFICATION FAILED'}`,
        `**Score:** ${result.score}/100`,
        '',
        '### DID Source',
        `- Provided by Contributor: ${result.checks.didProvided ? '**Yes** ✅' : 'No (fallback mock DID)'}`,
        '',
        '### Checks',
        `| Check | Result | Points |`,
        `|-------|--------|--------|`,
        `| DID Resolved | ${result.checks.didResolved ? '✅ Pass' : '❌ Fail'} | ${result.checks.didResolved ? '30' : '0'}/30 |`,
        `| Credential Valid | ${result.checks.credentialValid ? '✅ Pass' : '❌ Fail'} | ${result.checks.credentialValid ? '30' : '0'}/30 |`,
        `| Issuer Trusted | ${result.checks.issuerTrusted ? '✅ Pass' : '❌ Fail'} | ${result.checks.issuerTrusted ? '20' : '0'}/20 |`,
        `| DID Provided | ${result.checks.didProvided ? '✅ Pass' : '❌ Fail'} | ${result.checks.didProvided ? '20' : '0'}/20 |`,
        '',
        '### Result',
        `${statusIcon} **${result.verified ? 'Verification Passed' : 'Verification Failed'}** — Score: **${result.score}/100**`,
        '',
        '---',
        `*Verification Method:* \`${result.verificationMethod}\``,
        `*Timestamp:* ${result.timestamp}`,
      ].join('\n');

      // ── Find existing bot comment ──────────────────────────────────────
      const existingCommentId = await this.findExistingComment(owner, repo, prNumber);

      if (existingCommentId) {
        // Update in place — no duplicate spam
        await this.client.issues.updateComment({
          owner,
          repo,
          comment_id: existingCommentId,
          body,
        });
        logger.info('Updated existing verification comment', {
          owner, repo, prNumber, commentId: existingCommentId,
        });
      } else {
        // First time — create new comment
        await this.client.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body,
        });
        logger.info('Posted new verification comment', {
          owner, repo, prNumber, username,
        });
      }
    } catch (error) {
      logger.error('Failed to post verification comment', {
        owner,
        repo,
        prNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Search for an existing verification comment on this PR.
   * Returns the comment ID if found, null otherwise.
   */
  private async findExistingComment(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<number | null> {
    try {
      const { data: comments } = await this.client.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      });

      const existing = comments.find(
        (c) => c.body?.includes(GitHubService.COMMENT_MARKER)
      );

      return existing ? existing.id : null;
    } catch (error) {
      logger.warn('Could not search for existing comments — will create new', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ── Utility ─────────────────────────────────────────────────────────────

  /**
   * Fetch basic PR metadata.
   */
  async getPullRequest(owner: string, repo: string, prNumber: number) {
    try {
      const response = await this.client.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch PR information', {
        owner,
        repo,
        prNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────
let instance: GitHubService;

export function getGitHubService(token: string): GitHubService {
  if (!instance) {
    instance = new GitHubService(token);
  }
  return instance;
}

export { GitHubService };
