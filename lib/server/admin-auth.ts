import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

// Kept so the older login route still compiles. Not used any more.
export const ADMIN_COOKIE = 'scrut_admin'
export function adminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) return null
  return createHash('sha256').update('scrut:' + pw).digest('hex')
}

// Roles allowed to use the Tech Inspection (scrutineering review) routes.
// 'scrutineer' is added to the database in the roles migration; until a user
// has that role, only admin and control get through.
export const REVIEW_ROLES = ['admin', 'control', 'scrutineer'] as const

/**
 * Works out who is calling and what their role is.
 * The page sends the app's own login token with each request. The token is
 * checked with Supabase, then the person's role is read from user_roles.
 * Returns null if there is no valid login or the person has no role.
 */
export async function getRole(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null

  const { data: row } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id)
    .maybeSingle()

  return (row?.role as string | undefined) ?? null
}

/** True only if the caller is signed in AND has one of the allowed roles. */
export async function hasRole(request: NextRequest, allowed: readonly string[]): Promise<boolean> {
  const role = await getRole(request)
  return !!role && allowed.includes(role)
}

// The name is kept because the scrutineering routes already call it.
// It now means "signed in with a role that may review scrutineering forms",
// not "any signed-in user".
export async function isAdmin(request: NextRequest): Promise<boolean> {
  return hasRole(request, REVIEW_ROLES)
}
