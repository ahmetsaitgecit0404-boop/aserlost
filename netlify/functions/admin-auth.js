const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvsxeljnyxmhiwgsqhgx.supabase.co';
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 saat
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILS = 5;

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signToken(payload, secret) {
  const data = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  return data + '.' + sig;
}

function svcHeaders() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svcKey) return null;
  return { apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' };
}
async function isRateLimited(ip) {
  const headers = svcHeaders();
  if (!headers) return false;
  try {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const q = `${SUPABASE_URL}/rest/v1/login_attempts?ip=eq.${encodeURIComponent(ip)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`;
    const r = await fetch(q, { headers, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length >= RATE_LIMIT_MAX_FAILS) return true;
    }
  } catch (e) {
    // login_attempts tablosu yoksa veya Supabase erişilemezse hız sınırlamasını sessizce atla (fail-open)
  }
  return false;
}
async function logAttempt(ip, success) {
  const headers = svcHeaders();
  if (!headers) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/login_attempts`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ ip, success }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (e) {
    // login_attempts tablosu yoksa veya Supabase erişilemezse sessizce yut
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  if (!ADMIN_PASSWORD_HASH || !ADMIN_JWT_SECRET) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sunucu yapılandırması eksik (ADMIN_PASSWORD_HASH/ADMIN_JWT_SECRET).' }) };
  }
  try {
    const { password } = JSON.parse(event.body || '{}');
    if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Geçersiz giriş.' }) };
    }
    const ip = event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

    if (await isRateLimited(ip)) {
      return { statusCode: 429, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Çok fazla başarısız deneme. Lütfen 15 dakika sonra tekrar deneyin.' }) };
    }

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const expected = Buffer.from(ADMIN_PASSWORD_HASH, 'utf8');
    const got = Buffer.from(hash, 'utf8');
    const valid = expected.length === got.length && crypto.timingSafeEqual(expected, got);

    await logAttempt(ip, valid);

    if (!valid) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Yanlış şifre.' }) };
    }
    const now = Date.now();
    const token = signToken({ iat: now, exp: now + TOKEN_TTL_MS }, ADMIN_JWT_SECRET);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, expiresAt: now + TOKEN_TTL_MS }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sunucu hatası.' }) };
  }
};
