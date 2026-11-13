export async function api<T = any>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const r = await fetch(path, {
    method: body === undefined && method === 'GET' ? 'GET' : method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let j: any = null;
  try { j = await r.json(); } catch { /* empty */ }
  if (!r.ok || (j && j.ok === false)) throw new Error(j?.error || `Request failed (${r.status})`);
  return j as T;
}
export const get = <T = any,>(p: string) => api<T>(p, undefined, 'GET');
