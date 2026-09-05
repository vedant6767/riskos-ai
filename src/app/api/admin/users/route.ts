// ============================================================
// API: GET /api/admin/users — List users in org (ADMIN only)
// ============================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
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
    if (membership.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const orgId = membership.org_id;

    const { data: members, error } = await supabase
      .from('organization_members')
      .select(`
        id, role, created_at,
        user:users(id, email, full_name, created_at)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    // Org stats
    const { count: txCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId);

    const { count: caseCount } = await supabase
      .from('risk_cases')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId);

    const { count: pendingCount } = await supabase
      .from('review_queue')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'pending');

    const { data: org } = await supabase
      .from('organizations')
      .select('name, slug, plan, created_at')
      .eq('id', orgId)
      .single();

    return NextResponse.json({
      members: members ?? [],
      org,
      stats: {
        totalTransactions: txCount ?? 0,
        totalCases: caseCount ?? 0,
        pendingReview: pendingCount ?? 0,
        memberCount: members?.length ?? 0,
      },
    });
  } catch (err) {
    console.error('[Admin/Users] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
