// ============================================================
// API: GET /api/cases — Paginated list of risk cases
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single();
    if (!membership) return NextResponse.json({ error: 'No org found' }, { status: 403 });
    const orgId = membership.org_id;

    const sp = request.nextUrl.searchParams;
    const page   = Math.max(1, parseInt(sp.get('page')  ?? '1'));
    const limit  = Math.min(50, parseInt(sp.get('limit') ?? '20'));
    const offset = (page - 1) * limit;
    const status   = sp.get('status')   ?? '';
    const priority = sp.get('priority') ?? '';

    let query = supabase
      .from('risk_cases')
      .select(`
        id, case_number, status, priority, created_at, updated_at, resolved_at, resolution,
        transaction:transactions(
          id, external_tx_id, amount, currency, payment_method, payment_status, created_at,
          customer:customers(external_id)
        ),
        risk_score:risk_scores(score, level),
        investigation:investigations(id, status, completed_at)
      `, { count: 'exact' })
      .eq('org_id', orgId);

    if (status)   query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: cases, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      cases: cases ?? [],
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (err) {
    console.error('[Cases] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
