export const CHAIN_ENABLED = process.env.CHAIN_ENABLED === "true";

export async function safeChainCall<T>(
  fn: () => Promise<T>,
): Promise<T | null> {
  if (!CHAIN_ENABLED) return null;
  try {
    return await fn();
  } catch (e) {
    console.error("[chain] call failed (graceful degradation):", e);
    return null;
  }
}
