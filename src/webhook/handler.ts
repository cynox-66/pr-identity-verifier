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

  // 🔥 Handle ALL PR events (prevents missing edited/sync/etc.)
  webhooks.on('pull_request', async (event: any) => {
    logger.info('🔥 PR event received', {
      action: event.payload.action,
    });

    await handlePullRequestOpened(event, githubToken);
  });

  // 🧪 Debug visibility (very important)
  webhooks.onAny(({ id, name }: any) => {
    logger.info('📡 Webhook event received', {
      eventId: id,
      eventName: name,
    });
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