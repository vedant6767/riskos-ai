# RiskOS AI

**Detect Risk Before It Becomes Loss.**

An explainable, human-governed AI risk operating system for merchants. Built for the Razorpay AI Buildathon 2026 — Track 02: AI Risk Manager.

---

## What It Is

RiskOS AI is not a generic fraud classifier or a dashboard with fake statistics. It is a working risk operations platform that:

- Detects suspicious payment behavior using **five deterministic signal calculators**
- Runs an **AI investigator** (Gemini) on flagged cases and returns structured, validated evidence
- Shows the **deterministic engine verdict and the AI verdict side-by-side** — disagreements are flagged visually
- Keeps every automated action **bounded by a policy engine** — AI can only recommend, never execute
- Produces an **append-only audit trail** for every event from ingestion to decision
- Evaluates itself against a **held-out test set** and reports real precision, recall, F1, and false-positive cost in rupees

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router, React 18, TypeScript, Tailwind CSS |
| Charts | Recharts |
| Backend | Next.js API Routes (server-side only) |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Supabase Auth (email/password, JWT validation) |
| AI | Google Gemini 1.5 Flash — server-side only |
| Validation | Zod |

---

## Setup

### 1. Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini)

### 2. Clone and install

```bash
git clone <repo-url>
cd anti
npm install
```

### 3. Environment variables

Create a `.env.local` file in the project root:

```env
# Supabase — public (safe to expose in browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Supabase — secret (server-side only, never in browser)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Gemini — server-side only, never in browser
GEMINI_API_KEY=your-gemini-api-key

# App URL (used for OpenGraph metadata)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Never commit `.env.local` to git.**

### 4. Database setup

Run the migration in your Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql
```

This creates all tables, indexes, RLS policies, triggers, and the audit-log tamper-prevention rules.

### 5. Run the dev server

```bash
npm run dev
```

Visit `http://localhost:3000`.

### 6. First run

1. Register an account at `/register` — the first user in a new org is automatically given ADMIN role.
2. Sign in.
3. Click **Seed Demo Data** on the dashboard (or visit `/admin`).
   - This generates 2,000 synthetic transactions (1,400 dev / 600 held-out test set), customers, devices, risk scores, cases, and review queue items.
4. Go to **Review Queue** and pick a HIGH or CRITICAL case.
5. Click **Open full investigation** → **Investigate Case** to run the AI investigator.
6. Review the dual verdict, confidence banner, counterfactual analysis, and trust receipt.
7. Make a review decision — it is recorded in the audit log.
8. Visit **Evaluation Lab** and click **Run Evaluation** to see real precision/recall/F1 on the held-out test set.

---

## Architecture

```
User (browser)
  │
  ├─ /login, /register, /reset-password   ← Supabase Auth (JWT)
  │
  └─ Authenticated App
       │
       ├─ Next.js API Routes (server-side)
       │    │
       │    ├─ Auth middleware (getUser — JWT validated with Supabase servers)
       │    ├─ RBAC checks (role from organization_members)
       │    │
       │    ├─ Risk Engine (deterministic, no LLM)
       │    │    ├─ Amount deviation (z-score)
       │    │    ├─ Velocity anomaly
       │    │    ├─ Device change
       │    │    ├─ Time-of-day anomaly
       │    │    └─ Behavioral deviation
       │    │
       │    ├─ AI Investigator (Gemini — server-side only)
       │    │    ├─ Structured prompt with injection defense
       │    │    ├─ Zod schema validation of response
       │    │    └─ Graceful fallback if AI unavailable
       │    │
       │    ├─ Policy Engine (deterministic — AI cannot override)
       │    │    └─ allow / verify / review / escalate
       │    │
       │    ├─ Audit Logger (append-only, DB rules prevent UPDATE/DELETE)
       │    │
       │    └─ Evaluation Engine (no LLM — pure math)
       │         └─ precision, recall, F1, FPR, FNR, FP cost
       │
       └─ Supabase PostgreSQL
            └─ Row-Level Security (org isolation — every table)
```

---

## AI Design

### Where Gemini is used
- Investigation narrative (evidence summarization)
- Confidence-scored risk assessment
- Supporting and counter-evidence analysis
- Uncertainty notes and reasoning summary
- Advisory recommended action (never enforced directly)

### Where Gemini is NOT used
- Risk score calculation (deterministic math)
- Policy routing (rule-based thresholds)
- Permission or authorization checks
- Precision/recall/F1 calculation
- Any action that affects real financial transactions

### Prompt injection defense
All transaction data is placed inside explicitly delimited `<transaction_data>` blocks with system instructions that these fields cannot override the prompt. Field values are treated as untrusted strings throughout.

### AI output validation
Every Gemini response is parsed as JSON and validated against a Zod schema before being stored or displayed. Malformed or schema-invalid responses trigger the fallback path: the engine verdict is used, the case is escalated for human review, and the failure is audit-logged.

---

## Risk Scoring

Score range: 0–100. Thresholds are configurable via the policy engine.

| Range | Level |
|---|---|
| 0–30 | LOW |
| 31–60 | MEDIUM |
| 61–80 | HIGH |
| 81–100 | CRITICAL |

### Signals

| Signal | Max contribution | Calculation |
|---|---|---|
| Amount deviation | +25 pts | Z-score vs. customer historical average (stddev ≈ avg × 0.5) |
| Velocity anomaly | +25 pts | Transactions in last hour ÷ average hourly rate |
| Device change | +20 pts | New device (+15) or known-fraudulent device (+20) |
| Time-of-day anomaly | +15 pts | 0–4 AM (+15), 1–5 AM (+12), off-hours (+8) |
| Behavioral deviation | +15 pts | International (+8), new payment method (+4), high failure rate (+3) |

---

## Dataset

- **Total**: 2,000 synthetic transactions
- **Dev set**: 1,400 transactions (used for model tuning)
- **Held-out test set**: 600 transactions (never used during development; used only for evaluation)
- **Fraud rate**: ~15% overall (varies by customer risk tier: high ~55%, medium ~25%, low ~7%)
- **Borderline cases**: ~75 deliberately ambiguous transactions (50/50 fraud probability) across both splits
- **Features**: amount, payment method, device fingerprint, hour of day, international flag, velocity, customer history

---

## Evaluation

Run from the Evaluation Lab page (`/evaluation`). Results are calculated live from database records — nothing is hardcoded.

Metrics calculated:
- **Precision**: Of all flagged transactions, what fraction were actually fraud
- **Recall**: Of all fraud, what fraction were caught
- **F1**: Harmonic mean of precision and recall
- **False-positive rate**: Legitimate transactions incorrectly blocked
- **False-negative rate**: Fraud transactions that slipped through
- **False-positive cost (₹)**: Sum of legitimate transaction amounts incorrectly blocked
- **False-negative cost (₹)**: Sum of fraud transaction amounts that were missed
- **Fraud caught value (₹)**: Sum of fraud transaction amounts correctly flagged

Results are shown at multiple thresholds (20, 30, 40, 50, 60, 70, 80) with a precision-recall-F1 trade-off chart.

---

## Security

| Control | Implementation |
|---|---|
| Authentication | Supabase Auth; `getUser()` validates JWT with Supabase servers on every API call |
| Row-Level Security | All 16 tables have RLS policies — `org_id IN (get_user_org_ids())` |
| Multi-tenant isolation | Every query is scoped to the authenticated user's `org_id`; no cross-org data possible |
| RBAC | Four roles (ADMIN, RISK_ANALYST, MERCHANT, VIEWER); enforced server-side on every route |
| Audit tamper-prevention | `CREATE RULE audit_no_update/audit_no_delete` prevents any application-level modification of audit records |
| AI key isolation | `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-side only; never in the browser bundle |
| Input validation | Zod schemas on all API request bodies |
| Prompt injection | Transaction data in delimited untrusted blocks; explicit system instructions forbid field-value overrides |
| Structured AI output | Gemini responses validated with Zod before storage or display |
| Error handling | Stack traces never exposed to users; generic 500 messages in production |

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page — architecture, workflow, AI design, known limitations |
| `/login` | Sign in with email/password |
| `/register` | Create account + organization |
| `/reset-password` | Request / set new password |
| `/dashboard` | Stats, risk trend, distribution, recent high-risk, Simulate Fraud Spike |
| `/transactions` | Searchable/filterable transaction table |
| `/investigations/[id]` | **Flagship screen** — dual verdict, confidence, evidence, counterfactual, trust receipt, audit trail |
| `/review-queue` | Human review worklist with inline decision panel |
| `/evaluation` | Evaluation Lab — real metrics on held-out test set |
| `/admin` | Org overview, team members, data management, security status |

---

## Known Limitations

- **Synthetic data only.** Real-world fraud distributions differ significantly from this synthetic dataset. Calibration to production data would require real transaction history.
- **Risk thresholds are not merchant-calibrated.** The 0–30 / 31–60 / 61–80 / 81–100 bands are reasonable defaults but not validated against a specific merchant's risk tolerance.
- **AI confidence scores are self-reported.** Gemini's confidence scores are the model's own estimate, not calibrated probabilities. They should be treated as relative, not absolute.
- **No real payment gateway.** This system detects and routes risk — it does not execute, block, or refund real payments.
- **Counterfactual analysis is additive.** Signals are removed independently; interaction effects between signals are not modeled.
- **Single-hop risk signals only.** No network/graph-based fraud ring detection in this version.
- **No real-time streaming.** Dashboard refresh is manual or on-demand; no WebSocket/SSE live feed.

---

## What Makes This Different From a Standard Fraud Dashboard

Most fraud dashboards show a risk score and a "block/allow" button. RiskOS AI shows **why** it scored, **whether the AI agrees with the engine**, **how confident it is**, **what would need to change** (counterfactual), **what the policy decided** (and why that overrides AI), and **who did what** (complete audit trail). Every number is traceable to a real calculation or real stored data. The distinction between AI reasoning and deterministic enforcement is explicit and visible.

---

## License

Built for the Razorpay AI Buildathon 2026. Defense-only. No real financial transactions are executed or simulated.
