/**
 * Chain configuration — centralizes viem clients, OWS signer, and contract setup.
 *
 *   CHAIN_ENABLED=false  →  all exports are null (no network calls)
 *   CHAIN_ENABLED=true   →  lazy-init viem clients + OWS wallet
 *
 *   ┌──────────────┐
 *   │  config.ts   │  ← you are here
 *   ├──────────────┤
 *   │ publicClient │──► read-only Base Sepolia calls
 *   │ walletClient │──► write txs signed by OWS server wallet
 *   │ contracts    │──► ERC-8004 IdentityRegistry / ReputationRegistry
 *   └──────────────┘
 */

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ENABLED } from "./index";

// ---------------------------------------------------------------------------
// Lazy-init singletons
// ---------------------------------------------------------------------------

let _publicClient: PublicClient | null = null;
let _walletClient: WalletClient | null = null;

const RPC_URL = process.env.CHAIN_RPC_URL || process.env.ERC8004_RPC_URL || "https://sepolia.base.org";

/**
 * Read-only Base Sepolia client.
 */
export function getPublicClient(): PublicClient | null {
  if (!CHAIN_ENABLED) return null;
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(RPC_URL),
    });
  }
  return _publicClient;
}

/**
 * Wallet client backed by OWS-managed server key.
 *
 * The key is loaded from the OWS_WALLET_KEY env var. In a full production
 * setup this would come from @open-wallet-standard/core's encrypted store;
 * for Base Sepolia testnet we accept a hex private key so the server can
 * sign transactions without interactive wallet approval.
 */
export function getWalletClient(): WalletClient | null {
  if (!CHAIN_ENABLED) return null;
  if (_walletClient) return _walletClient;

  const key = process.env.OWS_WALLET_KEY;
  if (!key) {
    console.warn("[chain/config] OWS_WALLET_KEY not set — write operations disabled");
    return null;
  }

  try {
    const account = privateKeyToAccount(key as `0x${string}`);
    _walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(RPC_URL),
    });
    console.log(`[chain/config] Wallet client ready — address: ${account.address}`);
    return _walletClient;
  } catch (e) {
    console.error("[chain/config] Failed to create wallet client:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contract addresses (loaded from env, validated at call time)
// ---------------------------------------------------------------------------

export function getERC8004Addresses() {
  return {
    identity: process.env.ERC8004_IDENTITY_ADDRESS as `0x${string}` | undefined,
    reputation: process.env.ERC8004_REPUTATION_ADDRESS as `0x${string}` | undefined,
  };
}

export function getAlkahestAddress(): `0x${string}` | undefined {
  return process.env.ALKAHEST_CONTRACT_ADDRESS as `0x${string}` | undefined;
}

// ---------------------------------------------------------------------------
// Self Protocol config
// ---------------------------------------------------------------------------

export function getSelfConfig() {
  return {
    scope: process.env.SELF_SCOPE || "agentoverflow-verify",
    endpoint: process.env.SELF_ENDPOINT || "http://localhost:3000/agents",
  };
}
