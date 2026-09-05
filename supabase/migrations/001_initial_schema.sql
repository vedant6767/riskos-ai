-- ============================================================
-- RiskOS AI — Database Migration
-- Run this in Supabase SQL Editor (or via supabase db push)
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- CORE IDENTITY TABLES
-- ============================================================

-- Users (extends Supabase auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
comment on table public.users is 'Extended user profiles linked to Supabase Auth';

-- Organizations (merchant tenants)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'demo' check (plan in ('demo','starter','pro','enterprise')),
  settings jsonb not null default '{}',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
comment on table public.organizations is 'Merchant tenants — each org is isolated via RLS';

-- Organization Members (M:N user-org with role)
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('ADMIN','RISK_ANALYST','MERCHANT','VIEWER')),
  created_at timestamptz default now() not null,
  unique(org_id, user_id)
);
comment on table public.organization_members is 'Roles within organizations (ADMIN, RISK_ANALYST, MERCHANT, VIEWER)';

create index if not exists idx_org_members_user_id on public.organization_members(user_id);
create index if not exists idx_org_members_org_id on public.organization_members(org_id);

-- ============================================================
-- ENTITY TABLES
-- ============================================================

-- Customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_id text not null,
  email_hash text,
  account_age_days int,
  total_transactions int not null default 0,
  total_amount numeric(15,2) not null default 0,
  avg_transaction_amount numeric(15,2),
  risk_tier text not null default 'unknown',
  created_at timestamptz default now() not null,
  unique(org_id, external_id)
);
create index if not exists idx_customers_org_id on public.customers(org_id);

-- Devices
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  device_fingerprint text not null,
  device_type text,
  os text,
  browser text,
  is_known_fraudulent boolean not null default false,
  first_seen_at timestamptz default now() not null,
  last_seen_at timestamptz default now() not null,
  unique(org_id, device_fingerprint)
);
create index if not exists idx_devices_org_id on public.devices(org_id);

-- ============================================================
-- TRANSACTIONS (Core Fact Table)
-- ============================================================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_tx_id text not null,
  customer_id uuid references public.customers(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  amount numeric(15,2) not null check (amount > 0),
  currency text not null default 'INR',
  payment_method text not null check (payment_method in ('card','upi','netbanking','wallet','emi','bnpl')),
  payment_status text not null check (payment_status in ('success','failed','pending','refunded','disputed')),
  hour_of_day int check (hour_of_day between 0 and 23),
  day_of_week int check (day_of_week between 0 and 6),
  is_international boolean not null default false,
  ip_country text,
  is_fraud boolean,
  dataset_split text check (dataset_split in ('dev','test','live')),
  created_at timestamptz default now() not null,
  processed_at timestamptz,
  unique(org_id, external_tx_id)
);

create index if not exists idx_transactions_org_id on public.transactions(org_id);
create index if not exists idx_transactions_customer_id on public.transactions(customer_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);
create index if not exists idx_transactions_dataset_split on public.transactions(dataset_split);
create index if not exists idx_transactions_is_fraud on public.transactions(is_fraud) where is_fraud is not null;

-- ============================================================
-- RISK TABLES
-- ============================================================

-- Risk Scores (one per transaction)
create table if not exists public.risk_scores (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  score int not null check (score between 0 and 100),
  level text not null check (level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  model_version text not null default 'v1.0',
  calculated_at timestamptz default now() not null,
  unique(transaction_id)
);
create index if not exists idx_risk_scores_org_id on public.risk_scores(org_id);
create index if not exists idx_risk_scores_score on public.risk_scores(score desc);

-- Risk Signals (one row per signal per transaction)
create table if not exists public.risk_signals (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  signal_type text not null,
  signal_value numeric,
  contribution int not null check (contribution >= 0),
  description text,
  created_at timestamptz default now() not null
);
create index if not exists idx_risk_signals_transaction_id on public.risk_signals(transaction_id);

-- Risk Cases
create table if not exists public.risk_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  risk_score_id uuid references public.risk_scores(id) on delete set null,
  case_number text not null,
  status text not null default 'open' check (status in ('open','investigating','pending_review','resolved','escalated','closed')),
  priority text not null check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  assigned_to uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(org_id, case_number)
);
create index if not exists idx_risk_cases_org_id on public.risk_cases(org_id);
create index if not exists idx_risk_cases_status on public.risk_cases(status);
create index if not exists idx_risk_cases_priority on public.risk_cases(priority);

-- ============================================================
-- AI INVESTIGATION TABLES
-- ============================================================

-- Investigations
create table if not exists public.investigations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.risk_cases(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  initiated_by uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  started_at timestamptz default now() not null,
  completed_at timestamptz
);
create index if not exists idx_investigations_case_id on public.investigations(case_id);
create index if not exists idx_investigations_org_id on public.investigations(org_id);

-- AI Decisions (validated structured Gemini output)
create table if not exists public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  risk_assessment text not null check (risk_assessment in ('LOW','MEDIUM','HIGH','CRITICAL')),
  confidence_score int not null check (confidence_score between 0 and 100),
  primary_reason text not null,
  supporting_evidence jsonb not null default '[]',
  counter_evidence jsonb not null default '[]',
  recommended_action text not null check (recommended_action in ('allow','verify','review','escalate','block')),
  reasoning_summary text not null,
  uncertainty_notes text,
  requires_human_review boolean not null default false,
  model_used text not null,
  prompt_tokens int,
  response_tokens int,
  engine_verdict text not null check (engine_verdict in ('LOW','MEDIUM','HIGH','CRITICAL')),
  ai_verdict text not null check (ai_verdict in ('LOW','MEDIUM','HIGH','CRITICAL')),
  verdicts_agree boolean,
  created_at timestamptz default now() not null
);
create index if not exists idx_ai_decisions_investigation_id on public.ai_decisions(investigation_id);

-- ============================================================
-- POLICY & REVIEW TABLES
-- ============================================================

-- Risk Policies
create table if not exists public.risk_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  low_max int not null default 30 check (low_max between 0 and 100),
  medium_max int not null default 60 check (medium_max between 0 and 100),
  high_max int not null default 80 check (high_max between 0 and 100),
  low_action text not null default 'allow' check (low_action in ('allow','verify','review','escalate')),
  medium_action text not null default 'verify' check (medium_action in ('allow','verify','review','escalate')),
  high_action text not null default 'review' check (high_action in ('allow','verify','review','escalate')),
  critical_action text not null default 'escalate' check (critical_action in ('allow','verify','review','escalate')),
  min_ai_confidence int not null default 70 check (min_ai_confidence between 0 and 100),
  human_approval_threshold int not null default 75 check (human_approval_threshold between 0 and 100),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Review Queue
create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.risk_cases(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  investigation_id uuid references public.investigations(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','in_review','approved','rejected','escalated','legitimate')),
  priority text not null check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  policy_action text,
  analyst_decision text check (analyst_decision in ('approve','mark_legitimate','escalate','mark_suspicious')),
  analyst_notes text,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists idx_review_queue_org_status on public.review_queue(org_id, status);
create index if not exists idx_review_queue_priority on public.review_queue(priority);

-- ============================================================
-- AUDIT LOGS (Append-Only)
-- ============================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  actor_type text not null default 'system' check (actor_type in ('user','system','ai')),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}',
  policy_result text,
  outcome text,
  ip_address inet,
  created_at timestamptz default now() not null
);

-- Prevent UPDATE and DELETE on audit_logs
create or replace rule audit_no_update as on update to public.audit_logs do instead nothing;
create or replace rule audit_no_delete as on delete to public.audit_logs do instead nothing;

create index if not exists idx_audit_logs_org_id on public.audit_logs(org_id);
create index if not exists idx_audit_logs_entity_id on public.audit_logs(entity_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_event_type on public.audit_logs(event_type);

-- ============================================================
-- EVALUATION TABLES
-- ============================================================

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  split text not null check (split in ('dev','test')),
  transaction_count int,
  fraud_count int,
  legitimate_count int,
  created_at timestamptz default now() not null
);

create table if not exists public.evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  dataset_id uuid references public.datasets(id) on delete set null,
  model_version text not null default 'v1.0',
  threshold int not null check (threshold between 0 and 100),
  true_positives int,
  false_positives int,
  true_negatives int,
  false_negatives int,
  precision_score numeric(6,4),
  recall_score numeric(6,4),
  f1_score numeric(6,4),
  false_positive_rate numeric(6,4),
  false_negative_rate numeric(6,4),
  avg_tx_amount numeric(15,2),
  false_positive_cost numeric(15,2),
  false_negative_cost numeric(15,2),
  fraud_caught_value numeric(15,2),
  run_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now() not null
);
create index if not exists idx_evaluation_runs_org_id on public.evaluation_runs(org_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.customers enable row level security;
alter table public.devices enable row level security;
alter table public.transactions enable row level security;
alter table public.risk_scores enable row level security;
alter table public.risk_signals enable row level security;
alter table public.risk_cases enable row level security;
alter table public.investigations enable row level security;
alter table public.ai_decisions enable row level security;
alter table public.risk_policies enable row level security;
alter table public.review_queue enable row level security;
alter table public.audit_logs enable row level security;
alter table public.datasets enable row level security;
alter table public.evaluation_runs enable row level security;

-- Helper function: get user's org_ids
create or replace function public.get_user_org_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select org_id from public.organization_members where user_id = auth.uid();
$$;

-- Users: can see own profile
create policy "users_own_profile" on public.users
  for all using (id = auth.uid());

-- Organizations: can see orgs you're a member of
create policy "org_member_access" on public.organizations
  for select using (id in (select public.get_user_org_ids()));

-- Organization members: can see members of your orgs
create policy "org_member_list" on public.organization_members
  for select using (org_id in (select public.get_user_org_ids()));

-- Customers: org isolation
create policy "customers_org_isolation" on public.customers
  for all using (org_id in (select public.get_user_org_ids()));

-- Devices: org isolation
create policy "devices_org_isolation" on public.devices
  for all using (org_id in (select public.get_user_org_ids()));

-- Transactions: org isolation
create policy "transactions_org_isolation" on public.transactions
  for all using (org_id in (select public.get_user_org_ids()));

-- Risk scores: org isolation
create policy "risk_scores_org_isolation" on public.risk_scores
  for all using (org_id in (select public.get_user_org_ids()));

-- Risk signals: org isolation
create policy "risk_signals_org_isolation" on public.risk_signals
  for all using (org_id in (select public.get_user_org_ids()));

-- Risk cases: org isolation
create policy "risk_cases_org_isolation" on public.risk_cases
  for all using (org_id in (select public.get_user_org_ids()));

-- Investigations: org isolation
create policy "investigations_org_isolation" on public.investigations
  for all using (org_id in (select public.get_user_org_ids()));

-- AI decisions: org isolation
create policy "ai_decisions_org_isolation" on public.ai_decisions
  for all using (org_id in (select public.get_user_org_ids()));

-- Risk policies: org isolation
create policy "risk_policies_org_isolation" on public.risk_policies
  for all using (org_id in (select public.get_user_org_ids()));

-- Review queue: org isolation
create policy "review_queue_org_isolation" on public.review_queue
  for all using (org_id in (select public.get_user_org_ids()));

-- Audit logs: org isolation (read-only for non-admin; writes via service role)
create policy "audit_logs_org_read" on public.audit_logs
  for select using (org_id in (select public.get_user_org_ids()));

-- Datasets: org isolation
create policy "datasets_org_isolation" on public.datasets
  for all using (org_id in (select public.get_user_org_ids()));

-- Evaluation runs: org isolation
create policy "eval_runs_org_isolation" on public.evaluation_runs
  for all using (org_id in (select public.get_user_org_ids()));

-- ============================================================
-- TRIGGERS: Auto-update updated_at
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.handle_updated_at();

create trigger trg_risk_cases_updated_at
  before update on public.risk_cases
  for each row execute function public.handle_updated_at();

create trigger trg_risk_policies_updated_at
  before update on public.risk_policies
  for each row execute function public.handle_updated_at();

create trigger trg_review_queue_updated_at
  before update on public.review_queue
  for each row execute function public.handle_updated_at();

-- ============================================================
-- TRIGGER: Auto-create user profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Enable Realtime for dashboard live updates
-- ============================================================
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.risk_cases;
alter publication supabase_realtime add table public.review_queue;
