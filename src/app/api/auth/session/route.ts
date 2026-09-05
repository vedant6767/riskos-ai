// ============================================================
// API: GET /api/auth/session — returns current user + role + org
// ============================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    // Get user's org membership + role
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role, org_id, organizations(id, name, slug, plan)')
      .eq('user_id', user.id)
      .single();

    const { data: profile } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ user: null, error: 'No organization membership found' }, { status: 403 });
    }

    const org = (Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations) as { id: string; name: string; slug: string; plan: string } | null;

    return NextResponse.json({
      user: {
        id: user.id,
        email: profile?.email ?? user.email,
        role: membership.role,
        orgId: membership.org_id,
        orgName: org?.name ?? 'Unknown Org',
        fullName: profile?.full_name ?? null,
      },
    });
  } catch (err) {
    console.error('[Auth] Session error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
