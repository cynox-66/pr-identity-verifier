/**
 * GitHub Identity Verifier — Server Bootstrap
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createWebhookHandler } from './webhook/handler';
import { config } from './config';
import { logger } from './utils/logger';

// ── Environment validation ───────────────────────────────────────────────

function validateEnvironment(): {
  port: number;
  webhookSecret: string;
  githubToken: string;
} {
  const port = parseInt(process.env.PORT || '3000', 10);
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!webhookSecret) {
    throw new Error('GITHUB_WEBHOOK_SECRET environment variable is required');
  }

  if (!githubToken) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  return { port, webhookSecret, githubToken };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    const { port, webhookSecret, githubToken } = validateEnvironment();

    logger.info('Starting GitHub Identity Verifier', {
      port,
      nodeEnv: process.env.NODE_ENV || 'development',
      checkRuns: config.ENABLE_CHECK_RUNS,
      prComments: config.ENABLE_PR_COMMENTS,
      requireSignatures: config.REQUIRE_COMMIT_SIGNATURES,
      didDomain: config.DID_DOMAIN,
    });

    const app = express();

    // 🔥 1. WEBHOOK FIRST (raw body required)
    app.use(
      '/webhooks/github',
      createWebhookHandler(webhookSecret, githubToken)
    );

    // 🔥 2. THEN JSON PARSER (for everything else)
    app.use(express.json());

    // Health check
    app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        config: {
          checkRuns: config.ENABLE_CHECK_RUNS,
          prComments: config.ENABLE_PR_COMMENTS,
          requireSignatures: config.REQUIRE_COMMIT_SIGNATURES,
          maxCommitsPerPR: config.MAX_COMMITS_PER_PR,
        },
      });
    });

    // 404
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error('Express error', {
        message: err.message,
        stack: err.stack,
        path: req.path,
      });
      res.status(500).json({ error: 'Internal server error' });
    });

    app.listen(port, () => {
      logger.info('Server listening', {
        url: `http://localhost:${port}`,
        webhookUrl: `http://localhost:${port}/webhooks/github`,
        healthUrl: `http://localhost:${port}/health`,
      });
    });
  } catch (error) {
    logger.error('Fatal error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();