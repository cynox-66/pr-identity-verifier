/**
 * Webhook Handler Router
 */

import { createNodeMiddleware, Webhooks } from '@octokit/webhooks';
import { handlePullRequestOpened } from './pullRequest';
import { logger } from '../utils/logger';

export function createWebhookHandler(
  webhookSecret: string,
  githubToken: string
): ReturnType<typeof createNodeMiddleware> {
  const webhooks = new Webhooks({
    secret: webhookSecret,
  });

  webhooks.on('pull_request', async (event: any) => {
    logger.info('━━━━━━━━━━━━━━━━ PR EVENT RECEIVED ━━━━━━━━━━━━━━━━', {
      action: event.payload.action,
      repo: `${event.payload.repository.owner.login}/${event.payload.repository.name}`,
      pr: `#${event.payload.pull_request.number}`,
      contributor: event.payload.pull_request.user.login,
    });
    await handlePullRequestOpened(event, githubToken);
  });

  webhooks.onAny(({ id, name }: any) => {
    logger.debug('Webhook event received', { eventId: id, eventName: name });
  });

  webhooks.onError((error: any) => {
    logger.error('❌ Webhook processing error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });

  // ✅ CRITICAL: keep path '/'
  return createNodeMiddleware(webhooks, { path: '/' });
}