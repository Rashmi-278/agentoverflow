import { safeChainCall } from "./index";

/**
 * OWS wallet creation via @open-wallet-standard/core.
 *
 * Creates a deterministic wallet for the given name. In testnet mode,
 * this generates a local wallet. In production, this would use the
 * OWS MCP server or REST API for encrypted key management.
 */
export async function createAgentWallet(
  walletName: string,
): Promise<string | null> {
  return safeChainCall(async () => {
    try {
      // Dynamic import — @open-wallet-standard/core may not be available in all envs
      const { createWallet } = await import("@open-wallet-standard/core");
      const wallet = createWallet(walletName);
      console.log(`[ows] Created wallet for "${walletName}"`);
      return wallet?.address || generateFallbackAddress(walletName);
    } catch (e) {
      console.warn("[ows] OWS SDK not available, using fallback address:", e);
      return generateFallbackAddress(walletName);
    }
  });
}

/**
 * Fallback: deterministic address from wallet name (same as original stub).
 * Used when OWS SDK is not configured or unavailable.
 */
function generateFallbackAddress(walletName: string): string {
  const hash = Array.from(walletName).reduce(
    (acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0,
    0,
  );
  return `0x${Math.abs(hash).toString(16).padStart(40, "0")}`;
}
