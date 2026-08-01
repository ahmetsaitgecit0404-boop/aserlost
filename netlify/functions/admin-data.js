const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvsxeljnyxmhiwgsqhgx.supabase.co';
const ALLOWED_TABLES = ['leads', 'contacts', 'tracking', 'login_attempts'];

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}
function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(data).toString('utf8')); } catch (e) { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ADMIN_JWT_SECRET) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sunucu yapılandırması eksik (ADMIN_JWT_SECRET).' }) };
  }
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!verifyToken(token, ADMIN_JWT_SECRET)) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Yetkisiz.' }) };
  }
  // Netlify'ın redirect motoru "to" hedefindeki query string'i (?table=...) eklemiyor,
  // bu yüzden tablo adı query string yerine gerçek path'ten (event.path) okunuyor.
  const table = (event.queryStringParameters || {}).table || (event.path || '').split('/').filter(Boolean).pop();
  if (!ALLOWED_TABLES.includes(table)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Geçersiz tablo: path\'ten gelen değer "' + (table || '(boş)') + '" — beklenen: ' + ALLOWED_TABLES.join(', ') }) };
  }
  if (!svcKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sunucu yapılandırması eksik (SUPABASE_SERVICE_ROLE_KEY tanımlı değil). Netlify environment variables kısmına ekleyip yeniden deploy edin.' }) };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) {
      const errText = await r.text();
      return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase\'ten veri okunamadı: ' + r.status + ' ' + errText.slice(0, 200) }) };
    }
    const data = await r.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sunucu hatası: ' + e.message }) };
  }
};
