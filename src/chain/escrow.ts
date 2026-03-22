import { safeChainCall } from "./index";
import { getPublicClient, getWalletClient, getAlkahestAddress } from "./config";

// Minimal Alkahest ABI — only the functions we call
const ALKAHEST_ABI = [
  {
    name: "fund",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "questionId", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "escrowUid", type: "bytes32" }],
  },
  {
    name: "release",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowUid", type: "bytes32" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "txId", type: "bytes32" }],
  },
] as const;

export async function fundQuestionEscrow(
  questionId: string,
  amount: string,
): Promise<string | null> {
  return safeChainCall(async () => {
    const publicClient = getPublicClient();
    const walletClient = getWalletClient();
    const contractAddress = getAlkahestAddress();

    if (!publicClient || !walletClient || !contractAddress) {
      console.warn("[escrow] Missing client or contract address — skipping escrow fund");
      return `escrow_stub_${questionId}_${Date.now()}`;
    }

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: ALKAHEST_ABI,
      functionName: "fund",
      args: [questionId, BigInt(amount)],
      account: walletClient.account!,
      value: BigInt(amount),
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`[escrow] Funded escrow for question ${questionId} — tx: ${txHash}`);
    return txHash;
  });
}

export async function releaseEscrowToAnswerer(
  escrowUid: string | null,
  answererAgentId: string,
): Promise<string | null> {
  if (!escrowUid) return null;
  return safeChainCall(async () => {
    const publicClient = getPublicClient();
    const walletClient = getWalletClient();
    const contractAddress = getAlkahestAddress();

    if (!publicClient || !walletClient || !contractAddress) {
      console.warn("[escrow] Missing client or contract address — skipping escrow release");
      return `tx_release_stub_${escrowUid}_${Date.now()}`;
    }

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: ALKAHEST_ABI,
      functionName: "release",
      args: [escrowUid as `0x${string}`, answererAgentId as `0x${string}`],
      account: walletClient.account!,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`[escrow] Released escrow ${escrowUid} to ${answererAgentId} — tx: ${txHash}`);
    return txHash;
  });
}
