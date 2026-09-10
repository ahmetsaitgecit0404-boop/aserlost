package com.muvekkilbilgi.dogrulayici;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * RFC 6238 TOTP: HMAC-SHA1, 30 saniyelik pencere, 6 hane.
 * Sunucu tarafi (server.js) ayni algoritmayi kullaniyor; ikisi ayni anda
 * ayni kodu uretmezse giris calismaz, bu yuzden burada surprize yer yok.
 */
public final class Totp {

    private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    private Totp() {}

    /** Anahtarda yalnizca base32 harfleri kalir; bosluk ve kucuk harf tolere edilir. */
    public static String temizle(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        String u = s.toUpperCase(java.util.Locale.US);
        for (int i = 0; i < u.length(); i++) {
            char c = u.charAt(i);
            if (B32.indexOf(c) >= 0) sb.append(c);
        }
        return sb.toString();
    }

    public static boolean gecerli(String s) {
        return temizle(s).length() >= 16;
    }

    public static byte[] base32Coz(String s) {
        String t = temizle(s);
        int bit = 0, deger = 0, i = 0;
        byte[] out = new byte[t.length() * 5 / 8];
        for (int k = 0; k < t.length(); k++) {
            deger = (deger << 5) | B32.indexOf(t.charAt(k));
            bit += 5;
            if (bit >= 8) {
                out[i++] = (byte) ((deger >>> (bit - 8)) & 0xFF);
                bit -= 8;
            }
        }
        return out;
    }

    public static String kod(String secretBase32, long sayac) throws Exception {
        byte[] buf = new byte[8];
        for (int i = 7; i >= 0; i--) {
            buf[i] = (byte) (sayac & 0xFF);
            sayac >>>= 8;
        }
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(base32Coz(secretBase32), "HmacSHA1"));
        byte[] h = mac.doFinal(buf);
        int o = h[h.length - 1] & 0x0F;
        int n = ((h[o] & 0x7F) << 24) | ((h[o + 1] & 0xFF) << 16)
              | ((h[o + 2] & 0xFF) << 8) | (h[o + 3] & 0xFF);
        return String.format(java.util.Locale.US, "%06d", n % 1000000);
    }

    public static String simdikiKod(String secretBase32) throws Exception {
        return kod(secretBase32, System.currentTimeMillis() / 1000L / 30L);
    }

    public static int kalanSaniye() {
        return 30 - (int) ((System.currentTimeMillis() / 1000L) % 30L);
    }
}
