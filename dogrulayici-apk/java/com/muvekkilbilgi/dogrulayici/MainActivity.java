package com.muvekkilbilgi.dogrulayici;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Muvekkil Bilgi Dogrulayici — admin paneli icin TOTP kod ureteci.
 *
 * Gizli anahtar APK'nin icine GOMULMEZ: ilk acilista bir kez sorulur ve
 * uygulamanin kendi ozel alanina yazilir. Gomulu olsaydi APK dosyasini ele
 * geciren herkes kod uretebilir, iki asamali dogrulama anlamsiz kalirdi.
 *
 * Arayuz XML yerine kodla kuruluyor; boylece APK tek bir kaynak dosyasina
 * (ikon) bagli kaliyor ve elle derlenmesi basitlesiyor.
 */
public class MainActivity extends Activity {

    private static final String AYAR = "mb_dogrulayici";
    private static final String ANAHTAR = "secret";

    private static final int ARKA   = 0xFF0B0C10;
    private static final int YUZEY  = 0xFF181818;
    private static final int ALTIN  = 0xFFC5A880;
    private static final int SOLUK  = 0xFF808080;
    private static final int BEYAZ  = 0xFFFFFFFF;
    private static final int KIRMIZI = 0xFFEF4444;

    private String secret;
    private String sonKod = "";
    private TextView kodYazi, sureYazi, durumYazi;
    private View dolgu;
    private LinearLayout cubukKap;
    private final Handler el = new Handler(Looper.getMainLooper());
    private final Runnable dongu = new Runnable() {
        @Override public void run() { guncelle(); el.postDelayed(this, 250); }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(ARKA);
        getWindow().setNavigationBarColor(ARKA);
        // Kod ekranda acikken ekranin kararmasi kodu okumayi zorlastiriyor.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        secret = prefs().getString(ANAHTAR, null);
        if (secret != null && !Totp.gecerli(secret)) secret = null;
        if (secret == null) kurulumEkrani(); else kodEkrani();
    }

    @Override protected void onResume() { super.onResume(); if (secret != null) el.post(dongu); }
    @Override protected void onPause()  { super.onPause();  el.removeCallbacks(dongu); }

    private SharedPreferences prefs() {
        return getSharedPreferences(AYAR, Context.MODE_PRIVATE);
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics());
    }

    private LinearLayout kap() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER_HORIZONTAL);
        l.setBackgroundColor(ARKA);
        l.setPadding(dp(28), dp(48), dp(28), dp(28));
        return l;
    }

    private TextView yazi(String s, int boyut, int renk, boolean kalin) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, boyut);
        t.setTextColor(renk);
        t.setGravity(Gravity.CENTER);
        if (kalin) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private void bosluk(LinearLayout l, int yukseklik) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(yukseklik)));
        l.addView(v);
    }

    // ---------------- ilk kurulum ----------------
    private void kurulumEkrani() {
        LinearLayout l = kap();
        l.addView(yazi("Kurulum", 22, ALTIN, true));
        bosluk(l, 10);
        l.addView(yazi("GIZLI-ANAHTAR.txt dosyasindaki anahtari gir.\nBu bir kez sorulur.",
                13, SOLUK, false));
        bosluk(l, 22);

        final EditText giris = new EditText(this);
        giris.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
                | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        giris.setTextColor(BEYAZ);
        giris.setHintTextColor(SOLUK);
        giris.setHint("ANAHTARI YAPISTIR");
        giris.setGravity(Gravity.CENTER);
        giris.setTypeface(Typeface.MONOSPACE);
        giris.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        GradientDrawable kutu = new GradientDrawable();
        kutu.setColor(YUZEY);
        kutu.setCornerRadius(dp(10));
        kutu.setStroke(dp(1), 0xFF333333);
        giris.setBackground(kutu);
        giris.setPadding(dp(14), dp(14), dp(14), dp(14));
        l.addView(giris, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        bosluk(l, 10);
        final TextView uyari = yazi("", 12, KIRMIZI, false);
        l.addView(uyari);
        bosluk(l, 14);

        Button kaydet = new Button(this);
        kaydet.setText("Kaydet");
        kaydet.setTextColor(ARKA);
        kaydet.setTypeface(Typeface.DEFAULT_BOLD);
        kaydet.setAllCaps(false);
        GradientDrawable btn = new GradientDrawable();
        btn.setColor(ALTIN);
        btn.setCornerRadius(dp(10));
        kaydet.setBackground(btn);
        kaydet.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                String d = giris.getText().toString();
                if (!Totp.gecerli(d)) {
                    uyari.setText("Anahtar gecersiz. En az 16 karakter, A-Z ve 2-7 rakamlari.");
                    return;
                }
                secret = Totp.temizle(d);
                prefs().edit().putString(ANAHTAR, secret).apply();
                kodEkrani();
                el.post(dongu);
            }
        });
        l.addView(kaydet, new LinearLayout.LayoutParams(dp(160), dp(46)));
        setContentView(l);
    }

    // ---------------- kod ekrani ----------------
    private void kodEkrani() {
        LinearLayout l = kap();
        l.addView(yazi("ADMIN PANELI DOGRULAMA KODU", 11, SOLUK, true));
        bosluk(l, 18);

        kodYazi = yazi("------", 46, ALTIN, true);
        kodYazi.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        kodYazi.setLetterSpacing(0.12f);
        kodYazi.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { kopyala(); }
        });
        l.addView(kodYazi);
        bosluk(l, 18);

        cubukKap = new LinearLayout(this);
        GradientDrawable arka = new GradientDrawable();
        arka.setColor(YUZEY);
        arka.setCornerRadius(dp(4));
        cubukKap.setBackground(arka);
        dolgu = new View(this);
        GradientDrawable ic = new GradientDrawable();
        ic.setColor(ALTIN);
        ic.setCornerRadius(dp(4));
        dolgu.setBackground(ic);
        cubukKap.addView(dolgu, new LinearLayout.LayoutParams(0, dp(7)));
        l.addView(cubukKap, new LinearLayout.LayoutParams(dp(240), dp(7)));
        bosluk(l, 10);

        sureYazi = yazi("", 12, SOLUK, false);
        l.addView(sureYazi);
        bosluk(l, 20);
        durumYazi = yazi("Koda dokunarak kopyalayabilirsin", 11, SOLUK, false);
        l.addView(durumYazi);
        bosluk(l, 26);

        Button degistir = new Button(this);
        degistir.setText("Anahtari degistir");
        degistir.setTextColor(SOLUK);
        degistir.setAllCaps(false);
        degistir.setBackgroundColor(Color.TRANSPARENT);
        degistir.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { sifirlaSor(); }
        });
        l.addView(degistir);
        setContentView(l);
    }

    private void guncelle() {
        if (secret == null) return;
        try {
            String k = Totp.simdikiKod(secret);
            if (!k.equals(sonKod)) {
                sonKod = k;
                kodYazi.setText(k.substring(0, 3) + " " + k.substring(3));
            }
        } catch (Exception e) {
            kodYazi.setText("hata");
            return;
        }
        int kalan = Totp.kalanSaniye();
        int tam = cubukKap.getWidth();
        if (tam > 0) {
            LinearLayout.LayoutParams p = (LinearLayout.LayoutParams) dolgu.getLayoutParams();
            p.width = tam * kalan / 30;
            dolgu.setLayoutParams(p);
        }
        GradientDrawable g = (GradientDrawable) dolgu.getBackground();
        g.setColor(kalan <= 5 ? KIRMIZI : ALTIN);
        sureYazi.setText(kalan + " saniye sonra yenilenir");
    }

    private void kopyala() {
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cb != null) {
            cb.setPrimaryClip(ClipData.newPlainText("kod", sonKod));
            durumYazi.setText("Kopyalandi: " + sonKod);
            durumYazi.setTextColor(ALTIN);
            el.postDelayed(new Runnable() {
                @Override public void run() {
                    durumYazi.setText("Koda dokunarak kopyalayabilirsin");
                    durumYazi.setTextColor(SOLUK);
                }
            }, 1800);
        }
    }

    private void sifirlaSor() {
        new AlertDialog.Builder(this)
            .setTitle("Anahtari degistir")
            .setMessage("Kayitli anahtar silinsin mi? Yeniden girmen gerekecek.")
            .setNegativeButton("Vazgec", null)
            .setPositiveButton("Sil", new android.content.DialogInterface.OnClickListener() {
                @Override public void onClick(android.content.DialogInterface d, int w) {
                    prefs().edit().remove(ANAHTAR).apply();
                    secret = null;
                    sonKod = "";
                    el.removeCallbacks(dongu);
                    kurulumEkrani();
                    Toast.makeText(MainActivity.this, "Anahtar silindi", Toast.LENGTH_SHORT).show();
                }
            })
            .show();
    }
}
