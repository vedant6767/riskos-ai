// ============================================================
// API: GET /api/audit — Paginated audit log
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
    const page     = Math.max(1, parseInt(sp.get('page')      ?? '1'));
    const limit    = Math.min(100, parseInt(sp.get('limit')    ?? '50'));
    const offset   = (page - 1) * limit;
    const entityId = sp.get('entityId') ?? '';
    const eventType = sp.get('eventType') ?? '';

    let query = supabase
      .from('audit_logs')
      .select(`
        id, event_type, action, actor_type, details,
        policy_result, outcome, created_at, entity_type, entity_id,
        actor:users(full_name, email)
      `, { count: 'exact' })
      .eq('org_id', orgId);

    if (entityId)  query = query.eq('entity_id', entityId);
    if (eventType) query = query.eq('event_type', eventType);

    const { data: logs, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      logs: logs ?? [],
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (err) {
    console.error('[Audit] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
