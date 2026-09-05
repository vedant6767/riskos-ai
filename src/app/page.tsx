import Link from 'next/link';

// ─── tiny inline helpers ──────────────────────────────────────────────────────

function Shield({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function Check() {
  return (
    <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Cross() {
  return (
    <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── workflow steps ───────────────────────────────────────────────────────────

const WORKFLOW = [
  { n: '01', title: 'Transaction Ingested',   desc: 'Payment data arrives; customer, device, and behavioral context is assembled.' },
  { n: '02', title: 'Deterministic Scoring',  desc: 'Five signal calculators run — amount deviation, velocity, device change, time-of-day, behavioral shift. Score 0–100, no LLM involved.' },
  { n: '03', title: 'Evidence Collection',    desc: 'Each signal records its contribution and plain-English description. Audit log entry created.' },
  { n: '04', title: 'AI Investigation',       desc: 'For HIGH/CRITICAL cases: structured transaction data (not raw text) is sent to Gemini. Prompt injection is defended against explicitly.' },
  { n: '05', title: 'Dual-Verdict Comparison', desc: 'Engine verdict and AI verdict shown side-by-side. Disagreements are visually flagged — AI augments, never replaces.' },
  { n: '06', title: 'Policy Gate (Deterministic)', desc: 'A rule-based policy engine routes the case: allow / verify / human review / escalate. AI can only recommend — it cannot execute.' },
  { n: '07', title: 'Human Review',           desc: 'Analysts approve, mark legitimate, escalate, or add notes. Every action is recorded.' },
  { n: '08', title: 'Append-Only Audit Trail', desc: 'Every event from ingestion to decision is logged. UPDATE and DELETE rules on audit_logs prevent tampering.' },
];

const SIGNALS = [
  { name: 'Amount Deviation',    max: 25, desc: 'Z-score of transaction vs. customer baseline' },
  { name: 'Velocity Anomaly',    max: 25, desc: 'Transactions per hour vs. normal rate' },
  { name: 'Device Change',       max: 20, desc: 'New or known-fraudulent device flag' },
  { name: 'Time-of-Day Anomaly', max: 15, desc: 'Late-night or off-hours activity' },
  { name: 'Behavioral Deviation',max: 15, desc: 'New payment method, international, failure rate' },
];

const AI_YES = [
  'Investigation narrative and evidence summarization',
  'Confidence-scored risk assessment with uncertainty notes',
  'Supporting and counter-evidence analysis',
  'Natural-language reasoning summary',
  'Recommended (advisory) action',
];

const AI_NO = [
  'Risk score calculation (deterministic math only)',
  'Policy routing decisions',
  'Permission and authorization checks',
  'Precision / recall / F1 metric calculation',
  'Executing or blocking real financial transactions',
];

const SECURITY = [
  { title: 'Prompt Injection Defense',  desc: 'Transaction data is placed in clearly delimited untrusted blocks. Field values cannot override system instructions.' },
  { title: 'Row-Level Security',        desc: 'Every table has Supabase RLS policies. One org can never query another org\'s rows — enforced at the database level.' },
  { title: 'Server-Side Auth',          desc: 'getUser() validates JWT with Supabase servers on every API call. Session cookies are never trusted alone.' },
  { title: 'Append-Only Audit Log',     desc: 'Database rules prevent UPDATE and DELETE on audit_logs. The trail cannot be rewritten from inside the application.' },
  { title: 'Secrets Never in Client',   desc: 'GEMINI_API_KEY and SUPABASE_SERVICE_ROLE_KEY are server-side only. The browser never receives them.' },
  { title: 'Structured AI Output',      desc: 'All Gemini responses are validated against a Zod schema before storage or display. Malformed output triggers fallback.' },
];

// ─── page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* NAV */}
      <nav className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight">
              RiskOS <span className="text-blue-400">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-colors shadow-sm shadow-blue-900/30"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-5 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-500/10 text-xs text-blue-400 font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-slow" aria-hidden="true" />
          Defense-only · Razorpay AI Buildathon 2026 — Track 02
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-5">
          Detect Risk<br />
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            Before It Becomes Loss
          </span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
          RiskOS AI detects suspicious payment behavior, investigates the evidence, explains every decision,
          and keeps automated risk actions bounded and auditable.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-blue-900/30"
          >
            Start free
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-11 px-6 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-slate-100 font-medium text-sm transition-colors"
          >
            Sign in to dashboard
          </Link>
        </div>

        {/* hero visual — architecture summary */}
        <div className="mt-16 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-left max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Risk pipeline</p>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {[
              'Transaction',
              '→ Signals',
              '→ Score 0–100',
              '→ AI Investigation',
              '→ Policy Gate',
              '→ Human Review',
              '→ Audit Trail',
            ].map((step, i) => (
              <span
                key={i}
                className={
                  step.startsWith('→')
                    ? 'text-slate-600'
                    : 'px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300'
                }
              >
                {step}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-slate-100 mb-2">How RiskOS Works</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Every step from payment arrival to final decision is traceable, auditable, and explainable.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WORKFLOW.map((step) => (
            <div
              key={step.n}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-slate-700 transition-colors"
            >
              <span className="text-xs font-mono text-blue-500 font-bold">{step.n}</span>
              <h3 className="text-sm font-semibold text-slate-200 mt-1 mb-1.5">{step.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RISK SIGNALS */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 mb-3">Deterministic Risk Engine</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Five independently-calculated signals produce a 0–100 score. Every point is traceable
              to a real calculation — no black-box scores, no hardcoded thresholds.
            </p>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 font-mono text-xs">
              <p className="text-slate-500 mb-3"><span>{'// Example score breakdown'}</span></p>
              <div className="space-y-1.5">
                {[
                  { s: 'amount_deviation',    v: '+22', c: 'text-orange-400' },
                  { s: 'velocity_anomaly',    v: '+25', c: 'text-red-400' },
                  { s: 'device_change',       v: '+15', c: 'text-amber-400' },
                  { s: 'time_anomaly',        v: '+12', c: 'text-amber-400' },
                  { s: 'behavioral_deviation',v: '+8',  c: 'text-emerald-400' },
                ].map(row => (
                  <div key={row.s} className="flex justify-between">
                    <span className="text-slate-400">{row.s}</span>
                    <span className={`font-bold ${row.c}`}>{row.v}</span>
                  </div>
                ))}
                <div className="border-t border-slate-700 pt-1.5 flex justify-between">
                  <span className="text-slate-300 font-bold">Total score</span>
                  <span className="text-red-400 font-bold">82 / CRITICAL</span>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {SIGNALS.map(sig => (
              <div key={sig.name} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-200">{sig.name}</span>
                  <span className="text-xs text-slate-500">max +{sig.max} pts</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${sig.max}%` }}
                    aria-hidden="true"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">{sig.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY AI / WHY NOT AI */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-slate-100 mb-2">AI Used Precisely — Not Everywhere</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            The design boundary between LLM reasoning and deterministic logic is explicit and intentional.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">AI is used for</p>
            <ul className="space-y-2">
              {AI_YES.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                  <Check />{item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">AI is NOT used for</p>
            <ul className="space-y-2">
              {AI_NO.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                  <Cross />{item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* KEY FEATURES */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Built for Risk Operations</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              title: 'Dual-Verdict Comparison',
              desc: 'Engine score and AI assessment shown side-by-side on every investigation. Disagreements are visually flagged.',
              color: 'blue',
            },
            {
              title: 'Confidence-Aware UI',
              desc: 'Every AI investigation shows its confidence score. Below 70%, a "Low confidence — recommend human review" banner appears.',
              color: 'purple',
            },
            {
              title: 'Counterfactual Analysis',
              desc: '"What would need to change to lower this score?" Signals are removed one-by-one and the score is recalculated live. Clearly labeled as simulation.',
              color: 'amber',
            },
            {
              title: 'Policy Engine',
              desc: 'Deterministic routing: allow / verify / human review / escalate. AI recommendations are advisory only — policy always has final say.',
              color: 'emerald',
            },
            {
              title: 'Evaluation Lab',
              desc: 'Run precision, recall, F1, false-positive rate, and cost against the held-out test set. No hardcoded metrics. Shows cost in rupees.',
              color: 'orange',
            },
            {
              title: 'Trust Receipt',
              desc: 'Per-case shareable summary: score, top 3 evidence points, policy action, reviewer, timestamp. Screenshot-friendly for compliance.',
              color: 'blue',
            },
          ].map(f => {
            const colors: Record<string, string> = {
              blue:   'border-blue-500/20 bg-blue-500/5',
              purple: 'border-purple-500/20 bg-purple-500/5',
              amber:  'border-amber-500/20 bg-amber-500/5',
              emerald:'border-emerald-500/20 bg-emerald-500/5',
              orange: 'border-orange-500/20 bg-orange-500/5',
            };
            const titles: Record<string, string> = {
              blue: 'text-blue-400', purple: 'text-purple-400',
              amber: 'text-amber-400', emerald: 'text-emerald-400', orange: 'text-orange-400',
            };
            return (
              <div key={f.title} className={`rounded-xl border p-5 ${colors[f.color]}`}>
                <h3 className={`text-sm font-bold mb-1.5 ${titles[f.color]}`}>{f.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECURITY */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Security by Design</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Security is a product feature, not an afterthought.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECURITY.map(s => (
            <div key={s.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield className="w-4 h-4 text-blue-400 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-200">{s.title}</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* EVALUATION DISCLAIMER */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-8 text-center">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Evaluation Lab</p>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Real Metrics from a Held-Out Test Set</h2>
          <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
            The system is evaluated against 600 transactions withheld from development — never used for tuning.
            Precision, recall, F1, false-positive rate, and false-positive cost (in ₹) are calculated live
            from database records, not hardcoded. Run the evaluation yourself in the Evaluation Lab.
          </p>
        </div>
      </section>

      {/* KNOWN LIMITATIONS */}
      <section className="max-w-6xl mx-auto px-5 py-10">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 max-w-2xl mx-auto">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Known Limitations</p>
          <ul className="space-y-1.5 text-xs text-slate-400 leading-relaxed list-disc list-inside">
            <li>Synthetic dataset — real-world fraud distributions will differ significantly.</li>
            <li>Risk thresholds (0–30 / 31–60 / 61–80 / 81–100) are configurable but not calibrated to a specific merchant.</li>
            <li>AI confidence scores are self-reported by the model, not calibrated probabilities.</li>
            <li>No real payment gateway integration — this is a detection and triage system only.</li>
            <li>Counterfactual analysis removes signals in isolation; real risk interactions are not modeled.</li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 py-20 text-center">
        <h2 className="text-3xl font-bold text-slate-100 mb-4">Ready to see it in action?</h2>
        <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto">
          Create an account, seed the synthetic dataset, and run an investigation in under two minutes.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors shadow-lg shadow-blue-900/30"
        >
          Get started — it&apos;s free
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-600">
        <p>
          RiskOS AI — Built for Razorpay AI Buildathon 2026, Track 02: AI Risk Manager.
          Defense-only. No real financial transactions are executed.
        </p>
      </footer>
    </div>
  );
}
