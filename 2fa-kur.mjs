/* =====================================================================
   ADMIN PANELİ İÇİN İKİ AŞAMALI DOĞRULAMA KURULUMU
   Çalıştırma:  node 2fa-kur.mjs
   Bu araç bir gizli anahtar üretir, telefon uygulamasına eklemen için
   bağlantı verir ve doğru çalıştığını anında test etmen için o anki kodu
   gösterir. Anahtarı Hostinger'daki ortam değişkenlerine ekleyene kadar
   panelde hiçbir şey değişmez.
   ===================================================================== */
import crypto from 'node:crypto';
import readline from 'node:readline';

const ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALFABE[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALFABE[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const idx = ALFABE.indexOf(ch);
    if (idx === -1) throw new Error('Geçersiz karakter: ' + ch);
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function kod(secret, counter) {
  const key = base32Decode(secret);
  const b = Buffer.alloc(8);
  b.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  b.writeUInt32BE(counter % 0x100000000, 4);
  const h = crypto.createHmac('sha1', key).update(b).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1000000).padStart(6, '0');
}

const secret = base32Encode(crypto.randomBytes(20));
const hesap = 'muvekkilbilgi.com';
const uygulama = 'Muvekkil Bilgi Admin';
const otpauth = 'otpauth://totp/' + encodeURIComponent(uygulama) + ':' + encodeURIComponent(hesap)
  + '?secret=' + secret + '&issuer=' + encodeURIComponent(uygulama) + '&algorithm=SHA1&digits=6&period=30';

console.log('');
console.log('==================================================================');
console.log('  ADMİN PANELİ 2FA KURULUMU');
console.log('==================================================================');
console.log('');
console.log('1) GİZLİ ANAHTAR (bunu Hostinger ortam değişkenine ekle):');
console.log('');
console.log('   ADMIN_TOTP_SECRET=' + secret);
console.log('');
console.log('   hPanel -> muvekkilbilgi.com -> Ortam değişkenleri -> Ekle');
console.log('   Ekledikten sonra "Yeniden Dağıt" butonuna bas.');
console.log('');
console.log('2) TELEFONUNA EKLE:');
console.log('   Google Authenticator / Microsoft Authenticator / Authy indir,');
console.log('   "Kurulum anahtarı gir" seçeneğiyle şu anahtarı yaz:');
console.log('');
console.log('   ' + secret.replace(/(.{4})/g, '$1 ').trim());
console.log('');
console.log('   Ya da QR okutmak istersen şu bağlantıyı bir QR üreticiye ver:');
console.log('   ' + otpauth);
console.log('');
console.log('3) ŞU ANKİ KOD (uygulamandaki kodla aynı olmalı):');
const c = Math.floor(Date.now() / 1000 / 30);
console.log('');
console.log('   >>> ' + kod(secret, c) + ' <<<   (' + (30 - Math.floor(Date.now() / 1000) % 30) + ' saniye geçerli)');
console.log('');
console.log('   Uygulamandaki kod bununla aynıysa kurulum doğru.');
console.log('');
console.log('==================================================================');
console.log('  ÖNEMLİ: Bu anahtarı kaybetme. Kaybedersen panele giremezsin;');
console.log('  o durumda Hostinger ortam değişkeninden ADMIN_TOTP_SECRET');
console.log('  satırını silmen yeterli, giriş yine sadece şifreyle çalışır.');
console.log('==================================================================');
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Doğrulamak için uygulamadaki 6 haneli kodu yaz (boş bırakıp Enter: atla): ', (girilen) => {
  const g = String(girilen || '').trim();
  if (!g) { console.log('\nAtlandı. Anahtarı yukarıdan kopyalamayı unutma.\n'); rl.close(); return; }
  const now = Math.floor(Date.now() / 1000 / 30);
  let ok = false;
  for (let d = -1; d <= 1; d++) if (kod(secret, now + d) === g) ok = true;
  console.log(ok
    ? '\n✓ DOĞRU — uygulama ile sunucu aynı kodu üretiyor. Anahtarı ortam değişkenine ekleyebilirsin.\n'
    : '\n✗ EŞLEŞMEDİ — telefonun saati otomatik ayarda mı? Anahtarı doğru yazdığından emin ol.\n');
  rl.close();
});
