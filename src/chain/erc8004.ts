import { safeChainCall } from "./index";
import { getPublicClient, getWalletClient, getERC8004Addresses } from "./config";

/**
 * ERC-8004 ABIs — reverse-engineered from deployed Base Sepolia contracts.
 *
 * Identity (proxy → 0x7274...9c02):
 *   register(string agentId) → mints an NFT identity token
 *
 * Reputation (proxy → 0x16e0...da34):
 *   giveFeedback(uint256 tokenId, int128 score, uint8 category,
 *                string subject, string context, string details,
 *                string evidence, bytes32 ref) → records on-chain feedback
 *   readFeedback(uint256 tokenId, address client, uint64 index) → reads feedback
 *   getIdentityRegistry() → returns identity registry address
 */

const IDENTITY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const REPUTATION_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "score", type: "int128" },
      { name: "category", type: "uint8" },
      { name: "subject", type: "string" },
      { name: "context", type: "string" },
      { name: "details", type: "string" },
      { name: "evidence", type: "string" },
      { name: "ref", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "getIdentityRegistry",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export async function registerAgentOnChain(
  agentId: string,
  _walletAddress: string,
): Promise<string | null> {
  return safeChainCall(async () => {
    const publicClient = getPublicClient();
    const walletClient = getWalletClient();
    const addresses = getERC8004Addresses();

    if (!publicClient || !walletClient || !addresses.identity) {
      console.warn("[erc8004] Missing client or contract address — skipping registration");
      return `erc8004_stub_${agentId}_${Date.now()}`;
    }

    const { request } = await publicClient.simulateContract({
      address: addresses.identity,
      abi: IDENTITY_ABI,
      functionName: "register",
      args: [agentId],
      account: walletClient.account!,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`[erc8004] Registered agent ${agentId} — tx: ${txHash}`);
    return txHash;
  });
}

export async function postReputationFeedback(
  agentId: string,
  score: number,
): Promise<string | null> {
  return safeChainCall(async () => {
    const publicClient = getPublicClient();
    const walletClient = getWalletClient();
    const addresses = getERC8004Addresses();

    if (!publicClient || !walletClient || !addresses.reputation) {
      console.warn("[erc8004] Missing client or contract address — skipping feedback");
      return `tx_rep_stub_${agentId}_${score}_${Date.now()}`;
    }

    // tokenId 0 is used as a placeholder — in production, look up the agent's token ID
    const { request } = await publicClient.simulateContract({
      address: addresses.reputation,
      abi: REPUTATION_ABI,
      functionName: "giveFeedback",
      args: [
        BigInt(0),                              // tokenId (agent's NFT ID)
        BigInt(score * 10),                     // score as int128
        0,                                       // category (0 = general)
        agentId,                                 // subject
        "agentoverflow",                         // context
        `Answer scored ${score}/10`,             // details
        "",                                      // evidence
        "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,  // ref
      ],
      account: walletClient.account!,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`[erc8004] Posted reputation feedback for ${agentId} (score: ${score}) — tx: ${txHash}`);
    return txHash;
  });
}
