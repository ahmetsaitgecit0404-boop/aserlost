/* 2FA gizli anahtarını üretir ve masaüstüne yazar.
   Anahtar bilerek ekrana BASILMIYOR: terminal çıktısı kayda geçtiği için
   (sohbet geçmişi, log, ekran paylaşımı) gizli anahtarın oradan sızma
   ihtimali var. Dosyaya yazıp yalnızca dosya yolunu bildiriyoruz. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Uret(bayt) {
  const b = crypto.randomBytes(bayt);
  let s = '';
  for (let i = 0; i < b.length; i++) s += B32[b[i] % 32];
  return s;
}
function base32Coz(s) {
  const t = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bit = 0, deger = 0;
  const out = [];
  for (const ch of t) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    deger = (deger << 5) | i; bit += 5;
    if (bit >= 8) { out.push((deger >>> (bit - 8)) & 0xff); bit -= 8; }
  }
  return Buffer.from(out);
}
function kod(secret, sayac) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(sayac / 0x100000000), 0);
  buf.writeUInt32BE(sayac >>> 0, 4);
  const h = crypto.createHmac('sha1', base32Coz(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

const secret = base32Uret(32);                 // 32 karakter x 5 bit = 160 bit (RFC 6238 önerisi)
const uygulama = 'Muvekkil Bilgi';
const hesap = 'admin';
const otpauth = 'otpauth://totp/' + encodeURIComponent(uygulama) + ':' + encodeURIComponent(hesap) +
  '?secret=' + secret + '&issuer=' + encodeURIComponent(uygulama) + '&algorithm=SHA1&digits=6&period=30';

const klasor = path.join(os.homedir(), 'Desktop', 'muvekkilbilgi-2fa');
fs.mkdirSync(klasor, { recursive: true });
const dosya = path.join(klasor, 'GIZLI-ANAHTAR.txt');

const metin = [
  'MUVEKKILBILGI ADMIN PANELI - 2FA GIZLI ANAHTARI',
  '='.repeat(64),
  '',
  'BU DOSYAYI KIMSEYLE PAYLASMA. Bu anahtari bilen herkes',
  'dogrulama kodu uretebilir ve 2FA anlamsiz hale gelir.',
  '',
  '-'.repeat(64),
  '1) HOSTINGER ORTAM DEGISKENI (bunu panele yapistir)',
  '-'.repeat(64),
  '',
  '   Anahtar adi : ADMIN_TOTP_SECRET',
  '   Degeri      : ' + secret,
  '',
  '   Nereye: hPanel -> muvekkilbilgi.com -> Dagitimlar -> Yeniden Dagit',
  '           "Kaynak dosyalari" = "Onceki dosyalari kullanin" kalsin',
  '           Ortam Degiskenleri -> Daha fazlasini ekle',
  '           Sonra "Kaydet ve yeniden dagit"',
  '',
  '-'.repeat(64),
  '2) TELEFON / BILGISAYAR UYGULAMASINA GIRECEGIN ANAHTAR',
  '-'.repeat(64),
  '',
  '   ' + secret.replace(/(.{4})/g, '$1 ').trim(),
  '',
  '   (Google Authenticator gibi hazir bir uygulama da kullanabilirsin,',
  '    "kurulum anahtarini gir" secenegiyle ayni anahtari yaz.)',
  '',
  '   QR okutmak istersen bu baglantiyi bir QR ureticiye ver:',
  '   ' + otpauth,
  '',
  '-'.repeat(64),
  '3) KURULUM DOGRU MU?',
  '-'.repeat(64),
  '',
  '   Bu dosya olusturuldugu anda gecerli olan kod: ' + kod(secret, Math.floor(Date.now() / 1000 / 30)),
  '   (30 saniyede bir degisir; uygulamandaki kod ayni ANDA ayni olmali)',
  '',
  '='.repeat(64),
  'ANAHTARI KAYBETME. Telefonu kaybedip anahtar da elinde yoksa panele',
  'giremezsin; o durumda Hostinger dan ADMIN_TOTP_SECRET degiskenini',
  'silmek gerekir (bu da 2FA yi kapatir).',
  'Bu kagidi yazdirip bir yere kaldirmak en saglami.',
  ''
].join('\r\n');

fs.writeFileSync(dosya, metin, 'utf8');
console.log('Anahtar uretildi ve yazildi:');
console.log('  ' + dosya);
console.log('Uzunluk: ' + secret.length + ' karakter (base32) = ' + secret.length*5 + ' bit');
console.log('Ekrana bilerek basilmadi.');
