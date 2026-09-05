// ============================================================
// API: POST /api/auth/register
// Creates org + ADMIN membership for a newly registered user.
// Called immediately after supabase.auth.signUp succeeds client-side.
// Uses service-role client to bypass RLS for initial bootstrap.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  orgName: z.string().trim().min(2).max(80),
  userId: z.string().uuid(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function POST(request: NextRequest) {
  try {
    // Verify the caller is the authenticated user they claim to be
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { orgName, userId } = parsed.data;

    // Verify userId matches the authenticated user
    if (userId !== user.id) {
      return NextResponse.json({ error: 'User ID mismatch' }, { status: 403 });
    }

    // Check this user doesn't already have a membership (idempotent)
    const { data: existing } = await supabaseAdmin
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ message: 'Membership already exists' }, { status: 200 });
    }

    // Generate unique slug
    let baseSlug = slugify(orgName);
    if (!baseSlug) baseSlug = 'org';
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const { data: collision } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (!collision) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    // Create organization
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: orgName, slug, plan: 'demo' })
      .select('id')
      .single();

    if (orgError || !org) {
      console.error('[Register] Org creation failed:', orgError?.message);
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
    }

    // Ensure user profile exists (trigger should have done this, but be safe)
    await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? null,
      }, { onConflict: 'id' });

    // Create ADMIN membership (first user in new org is always ADMIN)
    const { error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({ org_id: org.id, user_id: userId, role: 'ADMIN' });

    if (memberError) {
      console.error('[Register] Membership creation failed:', memberError.message);
      // Roll back the org
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 });
    }

    return NextResponse.json({ orgId: org.id, message: 'Organization created' }, { status: 201 });
  } catch (err) {
    console.error('[Register] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
