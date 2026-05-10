/**
 * Experimental: Credo-ts Agent Initialization
 *
 * Demonstrates correct Credo-ts agent configuration for Hedera DID resolution.
 * This module shows the EXACT initialization pattern used by heka-identity-service.
 *
 * ─── STATUS ──────────────────────────────────────────────────────────────
 * EXPERIMENTAL: This module demonstrates the correct Credo-ts architecture
 * for the production integration. It requires @credo-ts/core, @credo-ts/node,
 * and @credo-ts/hedera packages to be installed.
 *
 * To install (requires native dependencies):
 *   npm install @credo-ts/core@0.6.3 @credo-ts/node@0.6.3 @credo-ts/hedera@0.6.3
 *
 * ─── PRODUCTION INTEGRATION ─────────────────────────────────────────────
 * In the LFX mentorship production system:
 *   - The Credo agent is initialized as a singleton at server startup
 *   - HederaModule handles did:hedera resolution via HCS message replay
 *   - DID Documents are cached (5-minute TTL) to avoid repeated HCS calls
 *   - The agent runs in "verifier-only" mode (no wallet, no issuance)
 *
 * ─── ARCHITECTURE NOTES ─────────────────────────────────────────────────
 * Credo-ts uses a modular plugin architecture:
 *   - Agent: core orchestrator
 *   - DidsModule: DID resolution and registration
 *   - HederaModule: Hedera-specific DID method support
 *   - Each module can register resolvers (read) and registrars (write)
 *
 * The GitHub App only needs RESOLUTION (read), not registration (write).
 * In production, DID registration happens during contributor onboarding
 * via heka-identity-service, not in the GitHub App.
 *
 * Reference: https://credo.js.org/guides/getting-started
 * Reference: https://github.com/openwallet-foundation/credo-ts
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── Type Definitions ──────────────────────────────────────────────────────
// These types mirror the actual Credo-ts interfaces, allowing this module
// to compile and demonstrate the architecture WITHOUT requiring the native
// dependencies to be installed. In production, these are imported from
// @credo-ts/core directly.

/** Mirrors @credo-ts/core Agent configuration */
export interface CredoAgentConfig {
  label: string;
  walletConfig?: {
    id: string;
    key: string;
  };
}

/** Mirrors @credo-ts/core DidsModule configuration */
export interface DidsModuleConfig {
  resolvers: DIDResolver[];
  registrars?: DIDRegistrar[];
}

/** Mirrors @credo-ts/core DID resolver interface */
export interface DIDResolver {
  readonly supportedMethods: string[];
  resolve(did: string): Promise<CredoDIDResolutionResult>;
}

/** Mirrors @credo-ts/core DID registrar interface */
export interface DIDRegistrar {
  readonly supportedMethods: string[];
}

/** Mirrors @credo-ts/core DID resolution result */
export interface CredoDIDResolutionResult {
  didDocument: {
    id: string;
    verificationMethod?: Array<{
      id: string;
      type: string;
      controller: string;
      publicKeyBase58?: string;
      publicKeyMultibase?: string;
    }>;
    authentication?: string[];
    service?: Array<{
      id: string;
      type: string;
      serviceEndpoint: string;
    }>;
  } | null;
  didResolutionMetadata: {
    error?: string;
    message?: string;
  };
}

// ── Hedera DID Resolver Configuration ─────────────────────────────────────

/**
 * Configuration for the Hedera DID resolver.
 *
 * The Hedera DID method uses the Hedera Consensus Service (HCS) for
 * DID Document storage. Resolution involves:
 *   1. Parse the DID to extract network + topic ID
 *   2. Query HCS for all messages on the topic
 *   3. Replay messages in order to reconstruct current DID Document state
 *
 * DID format: did:hedera:{network}:{topicId}_{pubKeyHash}
 * Example:    did:hedera:testnet:0.0.12345_z6MkhaXg...
 */
export interface HederaDIDResolverConfig {
  /** Hedera network: 'mainnet' | 'testnet' | 'previewnet' */
  network: 'mainnet' | 'testnet' | 'previewnet';
  /** Hedera mirror node URL for HCS message retrieval */
  mirrorNodeUrl?: string;
  /** Operator account ID (for paid operations, not needed for resolution) */
  operatorAccountId?: string;
  /** Operator private key (for paid operations, not needed for resolution) */
  operatorPrivateKey?: string;
}

/**
 * Create the Credo-ts agent configuration for the GitHub App verifier.
 *
 * This configuration is MINIMAL — the GitHub App only needs DID resolution,
 * not wallet management, credential issuance, or DIDComm messaging.
 *
 * In heka-identity-service, the full agent configuration includes:
 *   - Askar wallet (per-tenant key storage)
 *   - OpenID4VC modules (OID4VCI + OID4VP)
 *   - DIDComm v2
 *   - AnonCreds support
 *   - ISO mDL support
 *
 * The GitHub App's agent is deliberately lightweight.
 *
 * @example
 * ```typescript
 * // Production initialization (requires @credo-ts packages installed):
 *
 * import { Agent, DidsModule } from '@credo-ts/core';
 * import { agentDependencies } from '@credo-ts/node';
 * import { HederaModule, HederaDidResolver } from '@credo-ts/hedera';
 *
 * const agent = new Agent({
 *   config: createVerifierAgentConfig(),
 *   dependencies: agentDependencies,
 *   modules: {
 *     dids: new DidsModule({
 *       resolvers: [new HederaDidResolver()],
 *     }),
 *     hedera: new HederaModule({
 *       network: 'testnet',
 *     }),
 *   },
 * });
 *
 * await agent.initialize();
 *
 * // Resolve a Hedera DID:
 * const result = await agent.dids.resolve('did:hedera:testnet:0.0.12345_z6Mk...');
 * console.log(result.didDocument);
 * ```
 */
export function createVerifierAgentConfig(): CredoAgentConfig {
  return {
    label: 'hiero-identity-verifier',
    // No wallet config — the verifier doesn't hold keys or credentials.
    // It only resolves DIDs and validates VPs via Heka's OID4VP endpoint.
  };
}

/**
 * Create the default Hedera DID resolver configuration.
 *
 * @param network - Hedera network to use (default: testnet)
 */
export function createHederaResolverConfig(
  network: HederaDIDResolverConfig['network'] = 'testnet'
): HederaDIDResolverConfig {
  const mirrorNodes: Record<string, string> = {
    mainnet: 'https://mainnet.mirrornode.hedera.com',
    testnet: 'https://testnet.mirrornode.hedera.com',
    previewnet: 'https://previewnet.mirrornode.hedera.com',
  };

  return {
    network,
    mirrorNodeUrl: mirrorNodes[network],
  };
}

/**
 * Resolve a DID using the Credo-ts agent.
 *
 * This function demonstrates the resolution flow that the production
 * GitHub App will use. In production, the agent instance is a singleton
 * created at server startup.
 *
 * @param did - The DID URI to resolve (any supported method)
 * @returns The resolved DID Document, or null with error metadata
 *
 * @example
 * ```typescript
 * // With a real Credo agent:
 * const result = await resolveDIDWithCredo(agent, 'did:hedera:testnet:0.0.12345_z6Mk...');
 * if (result.didDocument) {
 *   const verificationMethod = result.didDocument.verificationMethod?.[0];
 *   // Use the public key for signature verification
 * }
 * ```
 */
export async function resolveDIDWithCredoExample(
  did: string
): Promise<CredoDIDResolutionResult> {
  // ── Validate DID format ─────────────────────────────────────────────
  if (!did || !did.startsWith('did:')) {
    return {
      didDocument: null,
      didResolutionMetadata: {
        error: 'invalidDid',
        message: `Invalid DID format: "${did}"`,
      },
    };
  }

  // ── Extract DID method ──────────────────────────────────────────────
  const method = did.split(':')[1];
  const supportedMethods = ['hedera', 'web', 'key'];

  if (!supportedMethods.includes(method)) {
    return {
      didDocument: null,
      didResolutionMetadata: {
        error: 'unsupportedDidMethod',
        message: `DID method "${method}" is not supported. Supported: ${supportedMethods.join(', ')}`,
      },
    };
  }

  // ── In production, this delegates to the Credo agent ────────────────
  //
  // const result = await agent.dids.resolve(did);
  // return result;
  //
  // For this prototype, we return a structured example response
  // that matches the exact shape Credo returns:

  return {
    didDocument: null,
    didResolutionMetadata: {
      error: 'notImplemented',
      message: 'Credo agent not initialized — install @credo-ts/core, @credo-ts/node, @credo-ts/hedera to enable live resolution',
    },
  };
}
