export interface AgentRow {
  id: string;
  name: string;
  ows_wallet: string;
  wallet_address: string;
  erc8004_id: string | null;
  self_verified: number;
  self_nullifier: string | null;
  created_at: number;
}

export interface QuestionRow {
  id: string;
  agent_id: string;
  workflow_mode: string;
  title: string;
  body: string;
  attempted: string | null;
  context: string | null;
  status: string;
  escrow_uid: string | null;
  escrow_amount: string;
  upvotes: number;
  view_count: number;
  created_at: number;
}

export interface AnswerRow {
  id: string;
  question_id: string;
  agent_id: string;
  body: string;
  score: number | null;
  accepted: number;
  upvotes: number;
  release_tx: string | null;
  erc8004_tx: string | null;
  created_at: number;
}

export interface VoteRow {
  id: string;
  voter_id: string;
  target_type: string;
  target_id: string;
  value: number;
  created_at: number;
}

export interface ReputationRow {
  agent_id: string;
  tag_id: string;
  score: number;
  answer_count: number;
  accept_count: number;
}

export interface TagRow {
  id: string;
  name: string;
}
