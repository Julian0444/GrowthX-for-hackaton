// Resolución de sesión y pertenencia en el servidor (ticket 08). Server-only.
//
// DECISIÓN ABIERTA D3: el mecanismo definitivo de identidad para la demo
// compartida sigue pendiente. Este módulo implementa el mínimo real que el
// ticket exige mientras tanto: un token de sesión OPACO (cookie httpOnly o
// Authorization: Bearer) cuyo hash vive en growthx.sessions, emitido por el
// servidor (lib/server/db/seed-dev.ts en desarrollo; los tests insertan sus
// propias sesiones). NO es un header confiado ni un selector de tenant: el
// token es una credencial; tenant y usuario salen de la base, y la pertenencia
// se revalida contra memberships en cada resolución.

import { createHash } from 'node:crypto';
import type pg from 'pg';
import { getAppPool } from '../db/pool.ts';

export const SESSION_COOKIE = 'growthx_session';

export interface SessionContext {
  userId: string;
  tenantId: string;
  role: string;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Extrae el token opaco de la petición: cookie growthx_session o
// Authorization: Bearer. Nunca un tenantId: eso no es una credencial.
export function sessionTokenFromRequest(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token.length > 0) return token;
  }
  const cookies = request.headers.get('cookie');
  if (cookies) {
    for (const part of cookies.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === SESSION_COOKIE) {
        const value = rest.join('=').trim();
        if (value.length > 0) {
          try {
            return decodeURIComponent(value);
          } catch {
            // Cookie malformada = credencial inválida, no caída de PostgreSQL.
            return null;
          }
        }
      }
    }
  }
  return null;
}

// Valida sesión y pertenencia contra la base (rol growthx_app; las tablas de
// identidad solo las lee este rol). Devuelve null si no hay token, expiró o la
// pertenencia ya no existe.
export async function resolveSessionContext(
  request: Request,
  pool?: pg.Pool,
): Promise<SessionContext | null> {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const { rows } = await (pool ?? getAppPool()).query(
    `select s.user_id, s.tenant_id, m.role
       from growthx.sessions s
       join growthx.memberships m
         on m.tenant_id = s.tenant_id and m.user_id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  if (rows.length === 0) return null;
  const row = rows[0] as { user_id: string; tenant_id: string; role: string };
  return { userId: row.user_id, tenantId: row.tenant_id, role: row.role };
}
