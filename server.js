const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvsxeljnyxmhiwgsqhgx.supabase.co';
const ADMIN_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const ADMIN_ALLOWED_TABLES = ['leads', 'contacts', 'tracking', 'login_attempts'];

function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlDecode(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return Buffer.from(str, 'base64'); }
function signAdminToken(payload, secret) {
  const data = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  return data + '.' + sig;
}
function verifyAdminToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  const a = Buffer.from(sig), b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(data).toString('utf8')); } catch (e) { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

if (!GROQ_API_KEY) {
  console.error('ERROR: GROQ_KEY environment variable not set!');
  console.error('  Windows (cmd): set GROQ_KEY=gsk_...');
  console.error('  PowerShell:    $env:GROQ_KEY="gsk_..."');
  console.error('  Or create .env file with: GROQ_KEY=gsk_...');
  process.exit(1);
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'https://muvekkilbilgi.com'],
  methods: ['POST', 'GET', 'OPTIONS'],
  maxAge: 86400
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname)));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Çok fazla istek gönderdiniz. Lütfen 1 dakika bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Sohbet limitine ulaştınız. Lütfen 1 dakika bekleyin.' }
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Geçersiz istek formatı' });
    }
    for (const m of messages) {
      if (typeof m.content !== 'string' || m.content.length > 4096) {
        return res.status(400).json({ error: 'Mesaj çok uzun' });
      }
      m.content = m.content.replace(/<[^>]*>/g, '').slice(0, 4096);
    }
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: typeof temperature === 'number' ? temperature : 0.8,
        max_tokens: max_tokens || 1024
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      return res.status(502).json({ error: 'AI servisi geçici olarak kullanılamıyor' });
    }
    const data = await groqRes.json();
    res.json(data);
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'AI servisi yanıt vermedi' });
    }
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/ai/calculate', apiLimiter, async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, responseFormat } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Geçersiz istek formatı' });
    }
    for (const m of messages) {
      if (typeof m.content === 'string') {
        if (m.content.length > 8000) return res.status(400).json({ error: 'Mesaj çok uzun' });
        m.content = m.content.replace(/<[^>]*>/g, '').slice(0, 8000);
      }
    }
    const groqBody = {
      model: model || 'llama-3.3-70b-versatile',
      messages: messages,
      temperature: typeof temperature === 'number' ? temperature : 0.3,
      max_tokens: max_tokens || 2048
    };
    if (responseFormat) groqBody.response_format = { type: 'json_object' };
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(groqBody),
      signal: AbortSignal.timeout(45000)
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      return res.status(502).json({ error: 'AI servisi geçici olarak kullanılamıyor' });
    }
    const data = await groqRes.json();
    res.json(data);
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'AI servisi yanıt vermedi' });
    }
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/ai/vision', apiLimiter, async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, responseFormat } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Geçersiz istek formatı' });
    }
    const groqBody = {
      model: model || 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: messages,
      temperature: typeof temperature === 'number' ? temperature : 0.3,
      max_tokens: max_tokens || 1024
    };
    if (responseFormat) groqBody.response_format = { type: 'json_object' };
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(groqBody),
      signal: AbortSignal.timeout(30000)
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq Vision API error:', groqRes.status, errText);
      return res.status(502).json({ error: 'AI görsel servisi kullanılamıyor' });
    }
    const data = await groqRes.json();
    res.json(data);
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'AI servisi yanıt vermedi' });
    }
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', keySet: !!GROQ_API_KEY });
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Çok fazla başarısız deneme. Lütfen 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

async function logLoginAttempt(ip, success) {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svcKey) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/login_attempts`, {
      method: 'POST',
      headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ip, success }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (e) {}
}

app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  if (!ADMIN_PASSWORD_HASH || !ADMIN_JWT_SECRET) {
    return res.status(500).json({ error: 'Sunucu yapılandırması eksik (ADMIN_PASSWORD_HASH/ADMIN_JWT_SECRET).' });
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
    return res.status(400).json({ error: 'Geçersiz giriş.' });
  }
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const expected = Buffer.from(ADMIN_PASSWORD_HASH, 'utf8');
  const got = Buffer.from(hash, 'utf8');
  const valid = expected.length === got.length && crypto.timingSafeEqual(expected, got);
  await logLoginAttempt(ip, valid);
  if (!valid) {
    return res.status(401).json({ error: 'Yanlış şifre.' });
  }
  const now = Date.now();
  const token = signAdminToken({ iat: now, exp: now + ADMIN_TOKEN_TTL_MS }, ADMIN_JWT_SECRET);
  res.json({ token, expiresAt: now + ADMIN_TOKEN_TTL_MS });
});

app.get('/api/admin/:table', async (req, res) => {
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ADMIN_JWT_SECRET) {
    return res.status(500).json({ error: 'Sunucu yapılandırması eksik (ADMIN_JWT_SECRET).' });
  }
  const table = req.params.table;
  if (!ADMIN_ALLOWED_TABLES.includes(table)) {
    return res.status(400).json({ error: 'Geçersiz tablo.' });
  }
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!verifyAdminToken(token, ADMIN_JWT_SECRET)) {
    return res.status(401).json({ error: 'Yetkisiz.' });
  }
  if (!svcKey) return res.status(500).json({ error: 'Sunucu yapılandırması eksik (SUPABASE_SERVICE_ROLE_KEY tanımlı değil).' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) {
      const errText = await r.text();
      return res.status(502).json({ error: 'Supabase\'ten veri okunamadı: ' + r.status + ' ' + errText.slice(0, 200) });
    }
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Müvekkil Bilgi server running on http://localhost:${PORT}`);
  console.log(`API proxy active — Groq key: ${GROQ_API_KEY.slice(0, 8)}...`);
});
