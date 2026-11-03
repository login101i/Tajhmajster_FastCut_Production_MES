import type { HandlerEvent } from '@netlify/functions';

/**
 * Optional gate: set MONITOR_ACCESS_TOKEN in Netlify env.
 * Frontend sends it as `Authorization: Bearer <token>` or `x-monitor-token`.
 * If env is empty, API is open (dev only — set a token in production).
 */
export function assertMonitorAccess(event: HandlerEvent): { ok: true } | { ok: false; statusCode: number; body: string } {
  const required = process.env.MONITOR_ACCESS_TOKEN?.trim();
  if (!required) return { ok: true };

  const header =
    event.headers.authorization ||
    event.headers.Authorization ||
    event.headers['x-monitor-token'] ||
    event.headers['X-Monitor-Token'] ||
    '';

  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
  if (bearer === required) return { ok: true };

  return {
    ok: false,
    statusCode: 401,
    body: JSON.stringify({ success: false, error: 'Unauthorized' }),
  };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-monitor-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};
