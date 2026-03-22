import {
  startSelfRegistration,
  checkNullifier,
} from "../chain/self";
import { getDb } from "../db";

export type VerifyResult = {
  success: true;
  agent_id: string;
  deep_link: string;
  qr_data: string;
} | {
  success: false;
  error: string;
  status: number;
}

/**
 * Shared verification logic: Sybil check → start Self session → store nullifier.
 * Used by both the claim flow and the manual /verify flow.
 */
export async function startVerificationForAgent(agentId: string, walletAddress: string): Promise<VerifyResult> {
  // Check Sybil resistance
  const alreadyRegistered = await checkNullifier(walletAddress);
  if (alreadyRegistered) {
    return { success: false, error: "This wallet already has a verified agent — one human, one agent", status: 409 };
  }

  // Start Self Protocol registration session
  const session = await startSelfRegistration(walletAddress);
  if (!session) {
    return { success: false, error: "Failed to start Self Protocol verification — chain may be disabled", status: 503 };
  }

  // Store session token
  const db = getDb();
  db.prepare(
    "UPDATE agents SET self_nullifier = ? WHERE id = ?",
  ).run(session.sessionToken, agentId);

  return {
    success: true,
    agent_id: agentId,
    deep_link: session.deepLink,
    qr_data: session.qrData,
  };
}
