import { safeChainCall } from "./index";

/**
 * Self Protocol — Agent ID verification for Sybil resistance.
 *
 * Uses the Self Agent ID API (https://app.ai.self.xyz/api/agent)
 * to register agents as proof-of-human verified.
 *
 * Flow:
 *   1. POST /register → get session token + QR code deep link
 *   2. User scans QR with Self app on phone
 *   3. Poll /register/status until complete
 *   4. Agent is now verified on-chain
 *   5. GET /verify/{chainId}/{agentId} confirms verification
 */

const SELF_API = "https://app.ai.self.xyz/api/agent";
const BASE_SEPOLIA_CHAIN_ID = "84532";

interface RegisterResponse {
  sessionToken: string;
  deepLink: string;
  agentAddress: string;
  qrData: string;
}

interface StatusResponse {
  status: "pending" | "complete" | "expired";
  agentId?: string;
}

/**
 * Start a Self Protocol registration session.
 * Returns a deep link / QR code for the user to scan with the Self app.
 */
export async function startSelfRegistration(
  humanWalletAddress: string,
): Promise<RegisterResponse | null> {
  return safeChainCall(async () => {
    const res = await fetch(`${SELF_API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "linked",
        network: "testnet",
        humanAddress: humanWalletAddress,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[self] Registration failed:", err);
      return null;
    }

    const data = await res.json();
    console.log("[self] Registration session started");
    return data as RegisterResponse;
  });
}

/**
 * Poll the registration status for a session.
 */
export async function checkRegistrationStatus(
  sessionToken: string,
): Promise<StatusResponse | null> {
  return safeChainCall(async () => {
    const res = await fetch(`${SELF_API}/register/status`, {
      headers: {
        "Authorization": `Bearer ${sessionToken}`,
      },
    });

    if (!res.ok) return null;
    return await res.json() as StatusResponse;
  });
}

/**
 * Verify if an agent has proof-of-human on-chain.
 * This is a public query — no auth needed.
 */
export async function verifySelfProof(
  agentId: string,
): Promise<boolean | null> {
  return safeChainCall(async () => {
    const res = await fetch(
      `${SELF_API}/verify/${BASE_SEPOLIA_CHAIN_ID}/${agentId}`,
    );

    if (!res.ok) {
      console.warn(`[self] Verification check failed for ${agentId}: ${res.status}`);
      return false;
    }

    const data = await res.json();
    console.log(`[self] Agent ${agentId} verification: ${JSON.stringify(data)}`);
    return !!data?.verified;
  });
}

/**
 * Check if a wallet address already has registered agents (Sybil check).
 * Returns true if the address already has agents registered.
 */
export async function checkNullifier(
  walletAddress: string,
): Promise<boolean | null> {
  return safeChainCall(async () => {
    const res = await fetch(
      `${SELF_API}/agents/${BASE_SEPOLIA_CHAIN_ID}/${walletAddress}`,
    );

    if (!res.ok) return false;

    const data = await res.json();
    const agents = Array.isArray(data) ? data : data?.agents || [];
    return agents.length > 0;
  });
}
