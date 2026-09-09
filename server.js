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
// gpt-oss / qwen3.6 birer "reasoning" modeli: düşünme adımları da completion
// token bütçesinden yeniyor, kapatılmazsa content boş (veya qwen'de <think>
// bloğu içeren ham metin) dönüyor. Kabul edilen değerler modele göre farklı:
//   openai/gpt-oss-*  -> low | medium | high
//   qwen/qwen3.6-*    -> none | default
// Yanlış değer 400 döndürdüğü için modele göre eşliyoruz.
const REASONING_HEADROOM = 1200;
function reasoningEffortFor(model) {
  const m = String(model || '');
  if (m.startsWith('qwen/')) return 'none';
  if (m.startsWith('openai/gpt-oss')) return 'low';
  return null;
}
function withReasoning(body) {
  const eff = reasoningEffortFor(body.model);
  if (eff) body.reasoning_effort = eff;
  return body;
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvsxeljnyxmhiwgsqhgx.supabase.co';
const ADMIN_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

/* =====================================================================
   İKİ AŞAMALI DOĞRULAMA (TOTP — RFC 6238)
   Admin paneline yalnızca şifreyle giriliyordu; şifre sızarsa tüm
   başvuru kayıtlarına (ad, telefon, sağlık verisi dahil) erişilebiliyor.
   Artık Google Authenticator / Microsoft Authenticator gibi bir
   uygulamadan gelen 6 haneli kod da isteniyor.

   ÖNEMLİ — kilitlenme riski yok: ADMIN_TOTP_SECRET ortam değişkeni
   tanımlı DEĞİLSE 2FA hiç devreye girmez ve giriş eskisi gibi çalışır.
   Yani anahtarı ekleyene kadar hiçbir şey değişmiyor.
   ===================================================================== */
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW = 1; /* saat kaymasına tolerans: ±1 adım (±30 sn) */

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(input || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error('Geçersiz base32 karakteri');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpCode(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16)
            | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
}

/* Kodu sabit süreli karşılaştırma ile doğrular; ±1 adım tolerans tanır. */
function verifyTotp(secretBase32, code) {
  const girilen = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(girilen)) return false;
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
    let beklenen;
    try { beklenen = totpCode(secretBase32, counter + d); } catch (e) { return false; }
    const a = Buffer.from(beklenen), b = Buffer.from(girilen);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

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
// ADMIN_PASSWORD_HASH "salt:hash" formatındaysa salted scrypt ile doğrular (GPU/rainbow-table
// saldırılarına dirençli); eski tuzsuz SHA-256 formatıyla geriye dönük uyumluluk korunur.
function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored) return false;
  if (stored.includes(':')) {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      const got = crypto.scryptSync(password, salt, expected.length);
      return got.length === expected.length && crypto.timingSafeEqual(got, expected);
    } catch (e) { return false; }
  }
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const expected = Buffer.from(stored, 'utf8');
  const got = Buffer.from(hash, 'utf8');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
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
      body: JSON.stringify(withReasoning({
        model: model || 'openai/gpt-oss-120b',
        messages: messages,
        temperature: typeof temperature === 'number' ? temperature : 0.8,
        max_tokens: Math.max(1024, (max_tokens || 1024) + REASONING_HEADROOM)
      })),
      signal: AbortSignal.timeout(30000)
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      return res.status(502).json({ error: 'AI servisi hatası (' + groqRes.status + '): ' + errText.slice(0, 300) });
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
      model: model || 'openai/gpt-oss-120b',
      messages: messages,
      temperature: typeof temperature === 'number' ? temperature : 0.3,
      max_tokens: Math.max(2048, (max_tokens || 2048) + REASONING_HEADROOM)
    };
    withReasoning(groqBody);
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
      return res.status(502).json({ error: 'AI servisi hatası (' + groqRes.status + '): ' + errText.slice(0, 300) });
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
      model: model || 'qwen/qwen3.6-27b',
      messages: messages,
      temperature: typeof temperature === 'number' ? temperature : 0.3,
      max_tokens: Math.max(1024, (max_tokens || 1024) + REASONING_HEADROOM)
    };
    withReasoning(groqBody);
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
      return res.status(502).json({ error: 'AI görsel servisi hatası (' + groqRes.status + '): ' + errText.slice(0, 300) });
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

/* ===================================================================
   GÜMRÜK BEYANNAMESİ YÜKLEME
   Gözetim modülünde kullanıcı beyannamesini seçtiğinde dosya gerçekten
   sunucuya gelmiyordu, sadece tarayıcıda kalıyordu. Dosya Supabase
   Storage'daki özel (public olmayan) bir bucket'a yazılıyor; bucket yoksa
   ilk yüklemede oluşturuluyor. Servis anahtarı yalnızca sunucuda,
   tarayıcıya hiç düşmüyor. Admin panelinde dosyaya, süreli imzalı link
   üzerinden erişiliyor.
   =================================================================== */
const BEYANNAME_BUCKET = 'beyannameler';
const BEYANNAME_MAX_BYTES = 3 * 1024 * 1024;
const BEYANNAME_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

async function ensureBeyannameBucket(svcKey) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BEYANNAME_BUCKET}`, {
    headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
    signal: AbortSignal.timeout(10000)
  });
  if (r.ok) return true;
  const c = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: BEYANNAME_BUCKET,
      name: BEYANNAME_BUCKET,
      public: false,
      file_size_limit: BEYANNAME_MAX_BYTES,
      allowed_mime_types: Object.keys(BEYANNAME_TYPES)
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (c.ok) return true;
  const body = await c.text();
  // Yarış durumunda "already exists" dönebilir; bu bir hata değil.
  if (/already exists|Duplicate/i.test(body)) return true;
  throw new Error('bucket oluşturulamadı (' + c.status + '): ' + body.slice(0, 200));
}

app.post('/api/beyanname', apiLimiter, async (req, res) => {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svcKey) return res.status(500).json({ error: 'Sunucu yapılandırması eksik (SUPABASE_SERVICE_ROLE_KEY).' });
  try {
    const { filename, mimeType, dataBase64, ad, telefon } = req.body || {};
    const ext = BEYANNAME_TYPES[mimeType];
    if (!ext) return res.status(400).json({ error: 'Yalnızca PDF, JPG, PNG veya WEBP yükleyebilirsiniz.' });
    if (typeof dataBase64 !== 'string' || !dataBase64) return res.status(400).json({ error: 'Dosya içeriği alınamadı.' });
    let buf;
    try { buf = Buffer.from(dataBase64, 'base64'); } catch (e) { return res.status(400).json({ error: 'Dosya içeriği okunamadı.' }); }
    if (!buf.length) return res.status(400).json({ error: 'Dosya boş görünüyor.' });
    if (buf.length > BEYANNAME_MAX_BYTES) return res.status(413).json({ error: 'Dosya en fazla 3 MB olabilir.' });

    await ensureBeyannameBucket(svcKey);

    const safe = String(filename || 'beyanname')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(-60);
    const stamp = new Date().toISOString().slice(0, 10);
    const rand = crypto.randomBytes(6).toString('hex');
    const objectPath = `${stamp}/${rand}-${safe.endsWith('.' + ext) ? safe : safe + '.' + ext}`;

    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BEYANNAME_BUCKET}/${encodeURI(objectPath)}`, {
      method: 'POST',
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'false',
        'cache-control': '3600'
      },
      body: buf,
      signal: AbortSignal.timeout(30000)
    });
    if (!up.ok) {
      const t = await up.text();
      console.error('Beyanname upload error:', up.status, t);
      return res.status(502).json({ error: 'Dosya yüklenemedi (' + up.status + ').' });
    }
    console.log('Beyanname yüklendi:', objectPath, buf.length + ' bayt', (ad || '-') + ' / ' + (telefon || '-'));
    res.json({ ok: true, path: objectPath, size: buf.length });
  } catch (e) {
    console.error('Beyanname endpoint hatası:', e.message);
    res.status(500).json({ error: 'Dosya yüklenirken bir hata oluştu.' });
  }
});

/* Admin panelinden beyannameyi indirmek için 10 dakika geçerli imzalı link. */
app.get('/api/admin/beyanname', async (req, res) => {
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ADMIN_JWT_SECRET) return res.status(500).json({ error: 'Sunucu yapılandırması eksik (ADMIN_JWT_SECRET).' });
  const authHeader = req.headers['authorization'] || '';
  if (!verifyAdminToken(authHeader.replace(/^Bearer\s+/i, ''), ADMIN_JWT_SECRET)) return res.status(401).json({ error: 'Yetkisiz.' });
  if (!svcKey) return res.status(500).json({ error: 'Sunucu yapılandırması eksik (SUPABASE_SERVICE_ROLE_KEY).' });
  const p = String(req.query.path || '');
  // Yol yalnızca bizim ürettiğimiz biçimde olabilir: 2026-01-31/abc123-dosya.pdf
  if (!/^\d{4}-\d{2}-\d{2}\/[0-9a-f]{12}-[\w.\-]{1,80}$/.test(p)) return res.status(400).json({ error: 'Geçersiz dosya yolu.' });
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BEYANNAME_BUCKET}/${encodeURI(p)}`, {
      method: 'POST',
      headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 600 }),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return res.status(502).json({ error: 'İndirme linki alınamadı (' + r.status + ').' });
    const j = await r.json();
    res.json({ url: SUPABASE_URL + '/storage/v1' + j.signedURL });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', keySet: !!GROQ_API_KEY, totp: !!process.env.ADMIN_TOTP_SECRET });
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
  const { password, totp } = req.body || {};
  if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
    return res.status(400).json({ error: 'Geçersiz giriş.' });
  }
  const valid = verifyPassword(password, ADMIN_PASSWORD_HASH);
  await logLoginAttempt(ip, valid);
  if (!valid) {
    return res.status(401).json({ error: 'Yanlış şifre.' });
  }
  /* İki aşamalı doğrulama yalnızca ADMIN_TOTP_SECRET tanımlıysa devreye
     girer — anahtar eklenmeden önce giriş akışı hiç değişmiyor, yani
     kilitlenme riski yok. */
  const TOTP_SECRET = process.env.ADMIN_TOTP_SECRET;
  if (TOTP_SECRET && !verifyTotp(TOTP_SECRET, totp)) {
    await logLoginAttempt(ip, false);
    return res.status(401).json({ error: 'Doğrulama kodu geçersiz.', totpRequired: true });
  }
  const now = Date.now();
  const token = signAdminToken({ iat: now, exp: now + ADMIN_TOKEN_TTL_MS }, ADMIN_JWT_SECRET);
  res.json({ token, expiresAt: now + ADMIN_TOKEN_TTL_MS });
});

// Kayıt silme. Yıkıcı bir işlem olduğu için yalnızca leads/contacts ile sınırlı:
// tracking ve login_attempts denetim kaydı olduğundan panelden silinemez.
const ADMIN_DELETABLE_TABLES = ['leads', 'contacts'];
app.delete('/api/admin/:table/:id', async (req, res) => {
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ADMIN_JWT_SECRET) {
    return res.status(500).json({ error: 'Sunucu yapılandırması eksik (ADMIN_JWT_SECRET).' });
  }
  const table = req.params.table;
  if (!ADMIN_DELETABLE_TABLES.includes(table)) {
    return res.status(400).json({ error: 'Bu tablodan kayıt silinemez.' });
  }
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!verifyAdminToken(token, ADMIN_JWT_SECRET)) {
    return res.status(401).json({ error: 'Yetkisiz.' });
  }
  // id yalnızca tamsayı olabilir; PostgREST filtresine serbest metin (örn. gt.0)
  // geçip tüm tabloyu silmesini engeller. Yapılandırma kontrolünden ÖNCE bakılır.
  const id = String(req.params.id || '');
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Geçersiz kayıt numarası.' });
  }
  if (!svcKey) return res.status(500).json({ error: 'Sunucu yapılandırması eksik (SUPABASE_SERVICE_ROLE_KEY tanımlı değil).' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, Prefer: 'return=representation' },
      signal: AbortSignal.timeout(15000)
    });
    const body = await r.text();
    if (!r.ok) {
      console.error('Supabase delete error:', r.status, body);
      return res.status(502).json({ error: 'Kayıt silinemedi (' + r.status + '): ' + body.slice(0, 200) });
    }
    let deleted = 0;
    try { const arr = JSON.parse(body); deleted = Array.isArray(arr) ? arr.length : 0; } catch (e) {}
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ ok: true, deleted });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
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

app.get('/yonetim', (req, res) => {
  res.sendFile(path.join(__dirname, 'yonetim.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Varsayılan: HER ZAMAN dinle. Daha önce iki kez bu yüzden ayağa kalkmadı:
//  1) `require.main === module` koşulu — Hostinger uygulamayı süreç yöneticisi
//     üzerinden modül olarak yüklediğinde false kalıyor, listen hiç çağrılmıyor.
//  2) `!process.env.VERCEL` koşulu — Hostinger ortamına Vercel'den .env içe
//     aktarılırken VERCEL=1 bulaşmış durumda, yine listen çağrılmıyor.
// Bu yüzden ortam tahminine hiç güvenmiyoruz: sunucusuz platformda dinlemeyi
// atlamak gerekirse SKIP_LISTEN=1 açıkça verilir.
// 0.0.0.0 açıkça veriliyor: yalnızca loopback'e bağlanma riski kalmasın.
if (process.env.SKIP_LISTEN !== '1') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Müvekkil Bilgi server listening on 0.0.0.0:${PORT}`);
    console.log(`API proxy active — Groq key: ${GROQ_API_KEY.slice(0, 8)}...`);
  });
}

module.exports = app;
