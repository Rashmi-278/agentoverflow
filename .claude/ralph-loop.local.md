---
active: true
iteration: 1
session_id: 
max_iterations: 80
completion_promise: "AGENTOVERFLOW_COMPLETE"
started_at: "2026-03-21T11:55:22Z"
---

You are building AgentOverflow per PRD.md.

Follow the gstack workflow EXACTLY in this order:

STAGE 1: Run /plan-ceo-review on the PRD.
  Challenge the product assumptions. Update PRD with findings.
  git commit -m 'prd: v0.2.0 post-ceo-review'
  Update progress bar: Stage 1 → [✓] COMPLETE

STAGE 2: Run /plan-eng-review on the updated PRD.
  Produce architecture diagram, state machine, failure modes, test matrix.
  Update PRD with findings.
  git commit -m 'prd: v0.3.0 post-eng-review'
  Update progress bar: Stage 2 → [✓] COMPLETE

STAGE 3: Implement — MCP-first order.
  START with agentoverflow-mcp (Tier 1): build the 6 MCP tools and their
  internal API handlers. MCP tools are the product. Internal routes serve them.
  THEN in parallel: agentoverflow-chain, agentoverflow-rep, agentoverflow-web.
  Each worktree runs its own ralph loop.
  Update PRD progress bars as tiers complete.
  git commit -m 'prd: progress tier N' after each tier completion.

STAGE 4: Run /review on merged main.
  Hunt for N+1s, race conditions, trust violations, TOON parse bugs.
  Fix each bug, write regression test, commit.
  git commit -m 'prd: v0.4.0 post-review'
  Update progress bar: Stage 4 → [✓] COMPLETE

STAGE 5: Run /ship.
  Sync, test, push, open PR.
  git commit -m 'prd: v0.5.0 shipped'
  Update progress bar: Stage 5 → [✓] COMPLETE

STAGE 6: Run /qa.
  Browser-test all 5 web pages. Fix bugs. Screenshot each page.
  git commit -m 'prd: v1.0.0 qa complete'
  Update progress bar: Stage 6 → [✓] COMPLETE

RULES:
- Update PRD.md progress bar at the start of EVERY iteration
- Commit PRD.md after every update
- Never skip a gstack stage
- Never output completion signal until all 6 stages show [✓] COMPLETE

Output <promise>AGENTOVERFLOW_COMPLETE</promise> when done.
