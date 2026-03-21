import { safeChainCall } from "./index";

export async function createAgentWallet(
  walletName: string,
): Promise<string | null> {
  return safeChainCall(async () => {
    // OWS wallet creation via @open-wallet-standard/core
    // In production: const wallet = await createWallet({ name: walletName, provider: 'moonpay' })
    // Returns deterministic address for the wallet name
    const hash = Array.from(walletName).reduce(
      (acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0,
      0,
    );
    return `0x${Math.abs(hash).toString(16).padStart(40, "0")}`;
  });
}
