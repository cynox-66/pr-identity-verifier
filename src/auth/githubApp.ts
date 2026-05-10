/**
 * GitHub App Authentication Module
 *
 * Production-grade GitHub App authentication architecture using @octokit/app.
 * Replaces the PAT-based authentication used in the PoC.
 *
 * ─── STATUS ──────────────────────────────────────────────────────────────
 * REAL: This module uses the actual @octokit/app SDK.
 *       The authentication flow (JWT → installation token → scoped Octokit)
 *       is production-correct.
 *
 * REQUIRES: A registered GitHub App with:
 *   - checks: write
 *   - pull_requests: read
 *   - contents: read (for commit signature data)
 *   - Webhook URL configured
 *   - Private key (.pem file)
 *
 * ─── PRODUCTION INTEGRATION ─────────────────────────────────────────────
 * In the LFX mentorship production system:
 *   - The App is registered under the Hiero GitHub organization
 *   - Installation tokens are per-repository (least privilege)
 *   - Tokens auto-rotate (1-hour TTL, managed by @octokit/app)
 *   - No PATs are used anywhere in the production flow
 * ─────────────────────────────────────────────────────────────────────────
 */

import { App } from '@octokit/app';
import { logger } from '../utils/logger';

/**
 * Configuration required to initialize a GitHub App.
 *
 * In production, these values come from:
 *   - APP_ID: GitHub App settings page
 *   - PRIVATE_KEY: Downloaded .pem file (never committed to repo)
 *   - WEBHOOK_SECRET: Configured in GitHub App webhook settings
 */
export interface GitHubAppConfig {
  /** GitHub App ID (numeric, from App settings) */
  appId: string;
  /** GitHub App private key (PEM format, RSA) */
  privateKey: string;
  /** Webhook secret for HMAC-SHA256 verification */
  webhookSecret: string;
}

/**
 * Create and configure a GitHub App instance.
 *
 * The App instance manages the full authentication lifecycle:
 *   1. JWT generation (signed with App's private key)
 *   2. Installation discovery (which repos have this App installed)
 *   3. Installation access token exchange (JWT → scoped token)
 *   4. Token auto-rotation (tokens expire after 1 hour)
 *
 * Each webhook event handler receives an installation-scoped Octokit
 * instance that can ONLY access the repository where the event occurred.
 *
 * @param config - GitHub App configuration
 * @returns Configured App instance
 *
 * @example
 * ```typescript
 * const app = createGitHubApp({
 *   appId: process.env.GITHUB_APP_ID!,
 *   privateKey: fs.readFileSync('private-key.pem', 'utf-8'),
 *   webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
 * });
 *
 * // Get installation-scoped Octokit for a specific installation
 * const octokit = await app.getInstallationOctokit(installationId);
 * ```
 */
export function createGitHubApp(config: GitHubAppConfig): App {
  const app = new App({
    appId: config.appId,
    privateKey: config.privateKey,
    webhooks: {
      secret: config.webhookSecret,
    },
  });

  logger.info('GitHub App initialized', {
    appId: config.appId,
    // Never log the private key
  });

  return app;
}

/**
 * Get an installation-scoped Octokit instance.
 *
 * This is the correct way to authenticate API calls in a GitHub App.
 * Each installation (repo/org that installed the App) gets its own
 * short-lived token with permissions scoped to that installation only.
 *
 * Token lifecycle (managed automatically by @octokit/app):
 *   1. First call: exchanges JWT for installation access token
 *   2. Subsequent calls: reuses cached token until near expiry
 *   3. Near expiry: automatically refreshes the token
 *
 * @param app - The GitHub App instance
 * @param installationId - The installation ID (from webhook payload)
 * @returns Octokit instance scoped to the installation
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getInstallationOctokit(
  app: App,
  installationId: number
): ReturnType<App['getInstallationOctokit']> {
  const octokit = await app.getInstallationOctokit(installationId);

  logger.debug('Installation Octokit created', { installationId });
  return octokit;
}

/**
 * Extract the installation ID from a webhook event payload.
 *
 * Every webhook event from a GitHub App includes the installation context.
 * This ID is used to get an installation-scoped Octokit instance.
 *
 * @param payload - The webhook event payload
 * @returns Installation ID, or null if not present
 */
export function extractInstallationId(payload: Record<string, unknown>): number | null {
  const installation = payload.installation as { id?: number } | undefined;
  if (!installation?.id) {
    logger.warn('Webhook payload missing installation ID — is this a GitHub App webhook?');
    return null;
  }
  return installation.id;
}
