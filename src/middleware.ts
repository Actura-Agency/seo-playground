import { NextRequest, NextResponse } from 'next/server';

// Second lock behind Cloudflare Access. When CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set, every
// request must carry a valid Cloudflare Access JWT, so reaching the server by its raw IP (skipping
// Cloudflare) gets a 403 instead of the app. Unset (e.g. local dev) = check disabled.
const TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN;
const AUD = process.env.CF_ACCESS_AUD;

type Jwk = JsonWebKey & { kid?: string };
let keyCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getKeys(forceRefresh: boolean): Promise<Jwk[]> {
  if (!forceRefresh && keyCache && Date.now() - keyCache.fetchedAt < 60 * 60_000) return keyCache.keys;
  const res = await fetch(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs fetch failed: ${res.status}`);
  const data = await res.json() as { keys: Jwk[] };
  keyCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function isValidAccessJwt(token: string): Promise<boolean> {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return false;
  const dec = new TextDecoder();
  const header = JSON.parse(dec.decode(b64urlToBytes(h))) as { kid?: string; alg?: string };
  const payload = JSON.parse(dec.decode(b64urlToBytes(p))) as { aud?: string | string[]; iss?: string; exp?: number };
  if (header.alg !== 'RS256') return false;
  if (payload.iss !== `https://${TEAM_DOMAIN}`) return false;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return false;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(AUD)) return false;

  let jwk = (await getKeys(false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
}

export async function middleware(req: NextRequest) {
  if (!TEAM_DOMAIN || !AUD) return NextResponse.next();
  const token = req.headers.get('cf-access-jwt-assertion');
  try {
    if (token && await isValidAccessJwt(token)) return NextResponse.next();
  } catch {
    // Any parse/fetch/crypto failure is a denial, never a pass-through.
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export const config = { matcher: '/:path*' };
