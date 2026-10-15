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

// Anyone signed in to the check-in app can use the Tech Inspection page.
// The page sends the app's own login token with each request.
export async function isAdmin(request: NextRequest): Promise<boolean> {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return false
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return !error && !!data?.user
}
