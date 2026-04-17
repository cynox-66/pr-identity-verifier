/**
 * Webhook Handler Router
 *
 * Routes incoming GitHub webhook events to the appropriate handler.
 * Currently handles:
 *   - pull_request.opened       → new PR triggers verification
 *   - pull_request.synchronize  → force-push / new commits re-triggers
 */

import { createNodeMiddleware, Webhooks } from '@octokit/webhooks';
import { handlePullRequestOpened } from './pullRequest';
import { logger } from '../utils/logger';

/**
 * Create and configure the webhook middleware for Express.
 */
export function createWebhookHandler(
  webhookSecret: string,
  githubToken: string
): ReturnType<typeof createNodeMiddleware> {
  const webhooks = new Webhooks({
    secret: webhookSecret,
  });

  // ── Event handlers ────────────────────────────────────────────────────

  // Verify identity when a new PR is opened
  webhooks.on('pull_request.opened', async (event: any) => {
    logger.info('Webhook event: pull_request.opened');
    await handlePullRequestOpened(event, githubToken);
  });

  // Re-verify when new commits are pushed to an existing PR
  webhooks.on('pull_request.synchronize', async (event: any) => {
    logger.info('Webhook event: pull_request.synchronize');
    await handlePullRequestOpened(event, githubToken);
  });

  // ── Debug / observability ─────────────────────────────────────────────

  webhooks.onAny(({ id, name }: any) => {
    logger.debug('Webhook event received', {
      eventId: id,
      eventName: name,
    });
  });

  webhooks.onError((error: any) => {
    logger.error('Webhook processing error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });

  // path: '/' ensures the middleware matches at the Express mount point directly.
  // Without this, createNodeMiddleware defaults to '/api/github/webhooks', making
  // the actual URL '/webhooks/github/api/github/webhooks' instead of '/webhooks/github'.
  return createNodeMiddleware(webhooks, { path: '/' });
}
