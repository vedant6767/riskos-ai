// ============================================================
// API: GET /api/transactions
// Cursor-based (keyset) pagination — stable under concurrent inserts,
// performant at any page depth. Risk level filter applied at DB level.
//
// Cursor format: base64(JSON { created_at, id })
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface CursorPayload { created_at: string; id: string }

function encodeCursor(created_at: string, id: string): string {
  return Buffer.from(JSON.stringify({ created_at, id })).toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
  } catch {
    return null;
  }
}

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
    const limit       = Math.min(parseInt(sp.get('limit')  ?? '25'), 100);
    const cursor      = sp.get('cursor') ?? '';
    const search      = sp.get('search') ?? '';
    const riskLevel   = sp.get('level')  ?? '';  // now DB-level via subquery
    const method      = sp.get('method') ?? '';
    const status      = sp.get('status') ?? '';
    const dataset     = sp.get('split')  ?? '';
    const fromDate    = sp.get('from')   ?? '';
    const toDate      = sp.get('to')     ?? '';

    // ---- If filtering by risk level, use a different query path ----
    // We join through risk_scores via a nested select and apply level filter there.
    // This avoids in-memory filtering so counts and cursors are accurate.

    if (riskLevel) {
      // Step 1: get transaction IDs that have the requested risk level
      const { data: riskIds, error: riskErr } = await supabase
        .from('risk_scores')
        .select('transaction_id')
        .eq('org_id', orgId)
        .eq('level', riskLevel);

      if (riskErr) throw new Error(riskErr.message);
      const txIds = (riskIds ?? []).map(r => r.transaction_id as string);
      if (txIds.length === 0) {
        return NextResponse.json({ transactions: [], nextCursor: null, total: 0 });
      }

      // Step 2: paginate those transactions with cursor
      let q = supabase
        .from('transactions')
        .select(`
          id, external_tx_id, amount, currency, payment_method, payment_status,
          hour_of_day, is_international, dataset_split, created_at,
          customer:customers(external_id, avg_transaction_amount),
          device:devices(device_type, os, is_known_fraudulent),
          risk_scores(score, level, model_version, calculated_at)
        `)
        .eq('org_id', orgId)
        .in('id', txIds);

      if (search)  q = q.ilike('external_tx_id', `%${search}%`);
      if (method)  q = q.eq('payment_method', method);
      if (status)  q = q.eq('payment_status', status);
      if (dataset) q = q.eq('dataset_split', dataset);
      if (fromDate) q = q.gte('created_at', fromDate);
      if (toDate)   q = q.lte('created_at', toDate);

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          q = q.or(
            `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`
          );
        }
      }

      const { data: rows, error } = await q
        .order('created_at', { ascending: false })
        .order('id',         { ascending: false })
        .limit(limit + 1);  // fetch one extra to know if there's a next page

      if (error) throw new Error(error.message);

      const transactions = (rows ?? []).slice(0, limit);
      const hasMore      = (rows ?? []).length > limit;
      const last         = transactions.at(-1);
      const nextCursor   = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

      return NextResponse.json({ transactions, nextCursor, total: txIds.length });
    }

    // ---- Standard cursor pagination (no risk level filter) ----
    let query = supabase
      .from('transactions')
      .select(`
        id, external_tx_id, amount, currency, payment_method, payment_status,
        hour_of_day, is_international, dataset_split, created_at,
        customer:customers(external_id, avg_transaction_amount),
        device:devices(device_type, os, is_known_fraudulent),
        risk_scores(score, level, model_version, calculated_at)
      `)
      .eq('org_id', orgId);

    if (search)  query = query.ilike('external_tx_id', `%${search}%`);
    if (method)  query = query.eq('payment_method', method);
    if (status)  query = query.eq('payment_status', status);
    if (dataset) query = query.eq('dataset_split', dataset);
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate)   query = query.lte('created_at', toDate);

    // Keyset: fetch rows where (created_at, id) < cursor
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        query = query.or(
          `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`
        );
      }
    }

    const { data: rows, error } = await query
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(limit + 1);

    if (error) throw new Error(error.message);

    // Get approximate total for display (separate count query, no cursor applied)
    let countQuery = supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId);
    if (search)  countQuery = countQuery.ilike('external_tx_id', `%${search}%`);
    if (method)  countQuery = countQuery.eq('payment_method', method);
    if (status)  countQuery = countQuery.eq('payment_status', status);
    if (dataset) countQuery = countQuery.eq('dataset_split', dataset);
    const { count } = await countQuery;

    const transactions = (rows ?? []).slice(0, limit);
    const hasMore      = (rows ?? []).length > limit;
    const last         = transactions.at(-1);
    const nextCursor   = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

    return NextResponse.json({
      transactions,
      nextCursor,
      total: count ?? 0,
    });

  } catch (error) {
    console.error('[Transactions] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
