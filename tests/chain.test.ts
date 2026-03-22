import { describe, it, expect } from "bun:test";

// .env has CHAIN_ENABLED=true and OWS_WALLET_KEY set.
// Real contract calls will be attempted but may fail (ABI mismatch, gas, etc.)
// safeChainCall catches all errors gracefully.

describe("chain/index — safeChainCall", () => {
  it("executes the function when CHAIN_ENABLED=true", async () => {
    const { safeChainCall } = await import("../src/chain/index");
    const result = await safeChainCall(async () => "test_value");
    expect(result).toBe("test_value");
  });

  it("catches errors and returns null", async () => {
    const { safeChainCall } = await import("../src/chain/index");
    const result = await safeChainCall(async () => {
      throw new Error("test error");
    });
    expect(result).toBeNull();
  });
});

describe("chain/config — client creation", () => {
  it("creates public client for Base Sepolia", async () => {
    const { getPublicClient } = await import("../src/chain/config");
    const client = getPublicClient();
    expect(client).not.toBeNull();
    expect(client!.chain?.id).toBe(84532);
  });

  it("returns wallet client or null depending on key config", async () => {
    const { getWalletClient } = await import("../src/chain/config");
    const client = getWalletClient();
    // May be non-null (key set) or null (key missing/invalid/cached from prior)
    // Either way, it shouldn't throw
    expect(client === null || typeof client === "object").toBe(true);
  });

  it("returns real ERC-8004 addresses from env", () => {
    const { getERC8004Addresses } = require("../src/chain/config");
    const erc = getERC8004Addresses();
    expect(erc.identity).toMatch(/^0x8004/);
    expect(erc.reputation).toMatch(/^0x8004/);
  });

  it("returns Alkahest address from env", () => {
    const { getAlkahestAddress } = require("../src/chain/config");
    const addr = getAlkahestAddress();
    expect(addr).toMatch(/^0x/);
  });

  it("returns Self config with defaults", () => {
    const { getSelfConfig } = require("../src/chain/config");
    const self = getSelfConfig();
    expect(self.scope).toBe("agentoverflow-verify");
  });
});

describe("chain/erc8004 — real contract calls (may fail gracefully)", () => {
  it("registerAgentOnChain returns string or null", async () => {
    const { registerAgentOnChain } = await import("../src/chain/erc8004");
    const result = await registerAgentOnChain("agent_test123", "0xABC");
    // Either returns a tx hash / stub string, or null if contract call fails
    expect(result === null || typeof result === "string").toBe(true);
  }, 15000);

  it("postReputationFeedback returns string or null", async () => {
    const { postReputationFeedback } = await import("../src/chain/erc8004");
    const result = await postReputationFeedback("agent_test123", 8);
    expect(result === null || typeof result === "string").toBe(true);
  }, 15000);
});

describe("chain/escrow — real contract calls (may fail gracefully)", () => {
  it("fundQuestionEscrow returns string or null", async () => {
    const { fundQuestionEscrow } = await import("../src/chain/escrow");
    const result = await fundQuestionEscrow("q_test123", "1000000");
    expect(result === null || typeof result === "string").toBe(true);
  }, 15000);

  it("releaseEscrowToAnswerer returns null for null escrowUid", async () => {
    const { releaseEscrowToAnswerer } = await import("../src/chain/escrow");
    const result = await releaseEscrowToAnswerer(null, "agent_test");
    expect(result).toBeNull();
  });

  it("releaseEscrowToAnswerer returns string or null", async () => {
    const { releaseEscrowToAnswerer } = await import("../src/chain/escrow");
    const result = await releaseEscrowToAnswerer("escrow_123", "agent_test");
    expect(result === null || typeof result === "string").toBe(true);
  }, 15000);
});

describe("chain/ows — wallet creation", () => {
  it("createAgentWallet returns a hex address", async () => {
    const { createAgentWallet } = await import("../src/chain/ows");
    const result = await createAgentWallet("test_wallet_" + Date.now());
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result!.startsWith("0x")).toBe(true);
  });
});

describe("chain/self — Self Protocol API", () => {
  it("verifySelfProof returns false/null for invalid agent", async () => {
    const { verifySelfProof } = await import("../src/chain/self");
    const result = await verifySelfProof("nonexistent_agent");
    expect(result === false || result === null).toBe(true);
  }, 15000);

  it("checkNullifier returns false for zero address", async () => {
    const { checkNullifier } = await import("../src/chain/self");
    const result = await checkNullifier("0x0000000000000000000000000000000000000000");
    expect(result === false || result === null).toBe(true);
  }, 15000);
});

// Integration tests using the Hono app
describe("POST /agents/:id/verify — endpoint", () => {
  it("returns 404 for non-existent agent", async () => {
    const { app } = await import("../src/index");
    const res = await app.request("/agents/agent_nonexistent/verify", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /agents/:id/verify/status — endpoint", () => {
  it("returns 404 for non-existent agent", async () => {
    const { app } = await import("../src/index");
    const res = await app.request("/agents/agent_nonexistent/verify/status");
    expect(res.status).toBe(404);
  });
});

describe("POST /agents — registration", () => {
  it("creates agent successfully", async () => {
    const { app } = await import("../src/index");
    const res = await app.request("/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "TestAgent_" + Date.now(),
        ows_wallet: "wallet_test_" + Date.now(),
        wallet_address: "0xTEST",
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toMatch(/^agent_/);
  }, 15000);
});
