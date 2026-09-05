// ============================================================
// API: GET /api/transactions — Paginated, filterable transaction list
// API: POST /api/transactions — (future: manual transaction ingestion)
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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
    const offset = (page - 1) * limit;

    // Filters
    const search = searchParams.get('search') ?? '';
    const riskLevel = searchParams.get('level') ?? '';
    const paymentMethod = searchParams.get('method') ?? '';
    const status = searchParams.get('status') ?? '';
    const fromDate = searchParams.get('from') ?? '';
    const toDate = searchParams.get('to') ?? '';
    const dataset = searchParams.get('split') ?? '';

    let query = supabase
      .from('transactions')
      .select(`
        id, external_tx_id, amount, currency, payment_method, payment_status,
        hour_of_day, is_international, ip_country, dataset_split, created_at,
        customer:customers(external_id, account_age_days, avg_transaction_amount),
        device:devices(device_type, os, is_known_fraudulent),
        risk_scores(score, level, model_version, calculated_at)
      `, { count: 'exact' })
      .eq('org_id', orgId);

    if (search) {
      query = query.or(`external_tx_id.ilike.%${search}%`);
    }
    if (paymentMethod) {
      query = query.eq('payment_method', paymentMethod);
    }
    if (status) {
      query = query.eq('payment_status', status);
    }
    if (fromDate) {
      query = query.gte('created_at', fromDate);
    }
    if (toDate) {
      query = query.lte('created_at', toDate);
    }
    if (dataset) {
      query = query.eq('dataset_split', dataset);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: transactions, error, count } = await query;

    if (error) throw new Error(error.message);

    // Filter by risk level in-memory (risk_scores is a join)
    let filtered = transactions ?? [];
    if (riskLevel) {
      filtered = filtered.filter(tx => {
        const rs = (Array.isArray(tx.risk_scores) ? tx.risk_scores[0] : tx.risk_scores) as { level: string } | null;
        return rs?.level === riskLevel;
      });
    }

    return NextResponse.json({
      transactions: filtered,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error('[Transactions] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
