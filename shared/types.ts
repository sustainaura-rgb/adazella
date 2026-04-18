// ==============================================
// Shared types — used by both frontend and api
// ==============================================

export type UserId = string;
export type WorkspaceId = string;

export type Plan = "trial" | "starter" | "pro" | "agency";

export interface User {
  id: UserId;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Workspace {
  id: WorkspaceId;
  owner_user_id: UserId;
  name: string;
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  target_acos: number; // user's ACoS target (default 25)
  created_at: string;
}

export interface AmazonConnection {
  id: string;
  workspace_id: WorkspaceId;
  profile_id: string;
  marketplace_id: string;
  account_name: string | null;
  connected_at: string;
  last_fetch_at: string | null;
  status: "active" | "disconnected" | "error";
}

// ---- Campaign data ----

export interface Campaign {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  status: "ENABLED" | "PAUSED" | "ARCHIVED";
  serving_status: string | null;
  daily_budget: number | null;
  portfolio_id: string | null;
}

export interface DailyPerformance {
  campaign_id: string;
  report_date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  cost: number;
  orders: number;
  sales: number;
  acos: number;
  ctr: number;
  cpc: number;
}

export interface SearchTerm {
  search_term: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id: string;
  ad_group_name: string;
  keyword: string;
  match_type: string;
  report_date: string;
  impressions: number;
  clicks: number;
  cost: number;
  orders: number;
  sales: number;
  add_to_cart: number;
  acos: number;
  ctr: number;
  cpc: number;
}

export interface ProductPerformance {
  asin: string;
  sku: string | null;
  campaign_id: string;
  campaign_name: string;
  ad_group_id: string;
  ad_group_name: string;
  report_date: string;
  impressions: number;
  clicks: number;
  cost: number;
  orders: number;
  sales: number;
  add_to_cart: number;
  acos: number;
  ctr: number;
  cpc: number;
}

// ---- Plans ----

export const PLAN_LIMITS: Record<Plan, { campaigns: number; automation_rules: number; team_seats: number }> = {
  trial:   { campaigns: 999,  automation_rules: 5,   team_seats: 1 },
  starter: { campaigns: 50,   automation_rules: 3,   team_seats: 1 },
  pro:     { campaigns: 999,  automation_rules: 999, team_seats: 3 },
  agency:  { campaigns: 9999, automation_rules: 999, team_seats: 10 },
};
