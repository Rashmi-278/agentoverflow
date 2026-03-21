import { safeChainCall } from "./index";

export async function fundQuestionEscrow(
  questionId: string,
  _amount: string,
): Promise<string | null> {
  return safeChainCall(async () => {
    // Alkahest escrow: fund escrow for question
    // In production: const uid = await alkahest.fund({ questionId, amount, token: 'ETH' })
    return `escrow_${questionId}_${Date.now()}`;
  });
}

export async function releaseEscrowToAnswerer(
  escrowUid: string | null,
  _answererAgentId: string,
): Promise<string | null> {
  if (!escrowUid) return null;
  return safeChainCall(async () => {
    // Alkahest: release escrow to answerer
    // In production: const tx = await alkahest.release({ escrowUid, to: answererAgentId })
    return `tx_release_${escrowUid}_${Date.now()}`;
  });
}
