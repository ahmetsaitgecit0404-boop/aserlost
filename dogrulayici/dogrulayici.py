"""
Muvekkil Bilgi Dogrulayici — admin paneli icin TOTP kod ureteci (Windows).

Gizli anahtar EXE'nin icine gomulmez: ilk acilista bir kez sorulur ve
kullanicinin kendi profiline yazilir (%APPDATA%). Gomulu olsaydi dosyayi
ele geciren herkes kod uretebilir, 2FA hicbir sey ifade etmezdi.

Kod RFC 6238'e gore uretiliyor: HMAC-SHA1, 30 saniyelik pencere, 6 hane.
Sunucudaki dogrulama da ayni algoritmayi kullaniyor (server.js).
"""
import base64
import hashlib
import hmac
import json
import os
import struct
import time
import tkinter as tk
from tkinter import messagebox

UYGULAMA = "Muvekkil Bilgi Dogrulayici"
AYAR_KLASOR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "MuvekkilBilgi")
AYAR_DOSYA = os.path.join(AYAR_KLASOR, "dogrulayici.json")

ARKA = "#0B0C10"
YUZEY = "#181818"
ALTIN = "#C5A880"
METIN = "#FFFFFF"
SOLUK = "#808080"


def anahtar_temizle(s: str) -> str:
    return "".join(ch for ch in s.upper() if ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")


def anahtar_gecerli(s: str) -> bool:
    t = anahtar_temizle(s)
    if len(t) < 16:
        return False
    try:
        base32_coz(t)
        return True
    except Exception:
        return False


def base32_coz(s: str) -> bytes:
    t = anahtar_temizle(s)
    t += "=" * ((8 - len(t) % 8) % 8)
    return base64.b32decode(t, casefold=True)


def totp(secret: str, zaman: float = None) -> str:
    if zaman is None:
        zaman = time.time()
    sayac = int(zaman // 30)
    ozet = hmac.new(base32_coz(secret), struct.pack(">Q", sayac), hashlib.sha1).digest()
    o = ozet[-1] & 0x0F
    n = struct.unpack(">I", ozet[o:o + 4])[0] & 0x7FFFFFFF
    return str(n % 1000000).zfill(6)


def kalan_saniye(zaman: float = None) -> int:
    if zaman is None:
        zaman = time.time()
    return 30 - int(zaman) % 30


def anahtar_oku():
    # utf-8-sig: dosya BOM ile kaydedilmisse (ornegin Not Defteri'nde acilip
    # kaydedilirse) duz utf-8 okumasi patliyor ve uygulama anahtari unutmus
    # gibi davraniyordu.
    try:
        with open(AYAR_DOSYA, "r", encoding="utf-8-sig") as f:
            deger = json.load(f).get("secret")
        return deger if deger and anahtar_gecerli(deger) else None
    except Exception:
        return None


def anahtar_yaz(secret: str):
    os.makedirs(AYAR_KLASOR, exist_ok=True)
    with open(AYAR_DOSYA, "w", encoding="utf-8") as f:
        json.dump({"secret": anahtar_temizle(secret)}, f)


class Uygulama(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(UYGULAMA)
        self.configure(bg=ARKA)
        self.resizable(False, False)
        self.geometry("380x300")
        try:
            self.eval("tk::PlaceWindow . center")
        except Exception:
            pass
        self.secret = anahtar_oku()
        self.son_kod = ""
        if self.secret:
            self.kod_ekrani()
        else:
            self.kurulum_ekrani()

    def temizle(self):
        for w in self.winfo_children():
            w.destroy()

    # ---------- ilk kurulum ----------
    def kurulum_ekrani(self):
        self.temizle()
        tk.Label(self, text="Kurulum", bg=ARKA, fg=ALTIN,
                 font=("Segoe UI", 16, "bold")).pack(pady=(26, 6))
        tk.Label(self, text="GIZLI-ANAHTAR.txt dosyasindaki anahtari yapistir.\nBu bir kez sorulur.",
                 bg=ARKA, fg=SOLUK, font=("Segoe UI", 9), justify="center").pack(pady=(0, 16))
        self.giris = tk.Entry(self, width=34, justify="center", font=("Consolas", 12),
                              bg=YUZEY, fg=METIN, insertbackground=ALTIN,
                              relief="flat", highlightthickness=1,
                              highlightbackground="#333", highlightcolor=ALTIN)
        self.giris.pack(ipady=8)
        self.giris.focus_set()
        self.giris.bind("<Return>", lambda e: self.kaydet())
        self.uyari = tk.Label(self, text="", bg=ARKA, fg="#ef4444", font=("Segoe UI", 9))
        self.uyari.pack(pady=(8, 0))
        tk.Button(self, text="Kaydet", command=self.kaydet, bg=ALTIN, fg=ARKA,
                  font=("Segoe UI", 10, "bold"), relief="flat", cursor="hand2",
                  activebackground="#A88B60", padx=26, pady=7).pack(pady=18)

    def kaydet(self):
        deger = self.giris.get()
        if not anahtar_gecerli(deger):
            self.uyari.config(text="Anahtar gecersiz. En az 16 karakter, A-Z ve 2-7 rakamlari.")
            return
        anahtar_yaz(deger)
        self.secret = anahtar_temizle(deger)
        self.kod_ekrani()

    # ---------- kod ekrani ----------
    def kod_ekrani(self):
        self.temizle()
        tk.Label(self, text="ADMIN PANELI DOGRULAMA KODU", bg=ARKA, fg=SOLUK,
                 font=("Segoe UI", 8, "bold")).pack(pady=(26, 10))
        self.kod_lbl = tk.Label(self, text="------", bg=ARKA, fg=ALTIN,
                                font=("Consolas", 40, "bold"), cursor="hand2")
        self.kod_lbl.pack()
        self.kod_lbl.bind("<Button-1>", lambda e: self.kopyala())
        self.cizgi = tk.Canvas(self, width=260, height=6, bg=YUZEY,
                               highlightthickness=0)
        self.cizgi.pack(pady=(14, 6))
        self.dolgu = self.cizgi.create_rectangle(0, 0, 260, 6, fill=ALTIN, width=0)
        self.sure_lbl = tk.Label(self, text="", bg=ARKA, fg=SOLUK, font=("Segoe UI", 9))
        self.sure_lbl.pack()
        self.durum = tk.Label(self, text="Koda tiklayarak kopyalayabilirsin",
                              bg=ARKA, fg=SOLUK, font=("Segoe UI", 8))
        self.durum.pack(pady=(12, 0))
        tk.Button(self, text="Anahtari degistir", command=self.sifirla, bg=ARKA, fg=SOLUK,
                  font=("Segoe UI", 8), relief="flat", cursor="hand2",
                  activebackground=ARKA, activeforeground=ALTIN, bd=0).pack(pady=(10, 0))
        self.guncelle()

    def guncelle(self):
        try:
            kod = totp(self.secret)
        except Exception:
            messagebox.showerror(UYGULAMA, "Anahtar okunamadi. Lutfen yeniden gir.")
            self.sifirla()
            return
        if kod != self.son_kod:
            self.son_kod = kod
            self.kod_lbl.config(text=kod[:3] + " " + kod[3:])
        kalan = kalan_saniye()
        self.cizgi.coords(self.dolgu, 0, 0, 260 * kalan / 30, 6)
        self.cizgi.itemconfig(self.dolgu, fill="#ef4444" if kalan <= 5 else ALTIN)
        self.sure_lbl.config(text=str(kalan) + " saniye sonra yenilenir")
        self.after(250, self.guncelle)

    def kopyala(self):
        self.clipboard_clear()
        self.clipboard_append(self.son_kod)
        self.durum.config(text="Kopyalandi: " + self.son_kod, fg=ALTIN)
        self.after(1800, lambda: self.durum.config(
            text="Koda tiklayarak kopyalayabilirsin", fg=SOLUK))

    def sifirla(self):
        if messagebox.askyesno(UYGULAMA, "Kayitli anahtar silinsin mi?\nYeniden girmen gerekecek."):
            try:
                os.remove(AYAR_DOSYA)
            except Exception:
                pass
            self.secret = None
            self.son_kod = ""
            self.kurulum_ekrani()


if __name__ == "__main__":
    Uygulama().mainloop()
