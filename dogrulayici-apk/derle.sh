#!/usr/bin/env bash
# APK'yi Gradle olmadan, dogrudan Android SDK araclariyla derler.
# Gradle wrapper indirmeye gerek kalmiyor; uygulama tek aktivite ve tek
# kaynak dosyasi oldugu icin bu zincir yeterli.
set -euo pipefail

SDK="${ANDROID_HOME:-C:/Android/Sdk}"
BT="$SDK/build-tools/34.0.0"
JAR="$SDK/platforms/android-34/android.jar"
KOK="$(cd "$(dirname "$0")" && pwd)"
B="$KOK/build"
D="$KOK/dist"

for t in "$BT/aapt2.exe" "$BT/d8.bat" "$BT/zipalign.exe" "$BT/apksigner.bat" "$JAR"; do
  [ -e "$t" ] || { echo "EKSIK: $t"; exit 1; }
done

rm -rf "$B"; mkdir -p "$B/res" "$B/gen" "$B/classes" "$B/dex" "$D"

echo "[1/7] kaynaklar derleniyor (aapt2 compile)"
"$BT/aapt2.exe" compile --dir "$KOK/res" -o "$B/res.zip"

echo "[2/7] paket baglaniyor (aapt2 link)"
"$BT/aapt2.exe" link \
  -o "$B/base.apk" \
  -I "$JAR" \
  --manifest "$KOK/AndroidManifest.xml" \
  -R "$B/res.zip" \
  --java "$B/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --auto-add-overlay

# javac ve d8 birer Windows programi; Git Bash'in "/c/Users/..." yollarini
# anlamiyorlar ve bosluklu yollar tirnaksiz gecince arguman bolunuyor.
# Bu yuzden liste dosyalarina Windows yolu + tirnak yaziyoruz.
# javac argumanlari tirnakli ister (bosluklu yol boluneceginden), d8'in
# liste okuyucusu ise tirnagi yol karakteri sanip patliyor — bu yuzden iki
# ayri bicim.
liste() {  # liste <tirnak:evet|hayir> <cikti> <kok...> <desen>
  local tirnak="$1"; local cikti="$2"; shift 2
  local desen="${!#}"
  : > "$cikti"
  for kok in "$@"; do
    [ "$kok" = "$desen" ] && continue
    while IFS= read -r f; do
      if [ "$tirnak" = "evet" ]; then printf '"%s"\n' "$(cygpath -m "$f")" >> "$cikti"
      else printf '%s\n' "$(cygpath -m "$f")" >> "$cikti"; fi
    done < <(find "$kok" -name "$desen")
  done
}

echo "[3/7] java derleniyor"
liste evet "$B/kaynaklar.txt" "$KOK/java" "$B/gen" '*.java'
javac -nowarn -encoding UTF-8 --release 11 \
  -cp "$(cygpath -m "$JAR")" -d "$(cygpath -m "$B/classes")" "@$(cygpath -m "$B/kaynaklar.txt")"

echo "[4/7] dex uretiliyor (d8)"
liste hayir "$B/siniflar.txt" "$B/classes" '*.class'
"$BT/d8.bat" --lib "$(cygpath -m "$JAR")" --min-api 24 \
  --output "$(cygpath -m "$B/dex")" "@$(cygpath -m "$B/siniflar.txt")"

echo "[5/7] dex apk icine ekleniyor"
python - "$B/base.apk" "$B/dex/classes.dex" <<'PY'
import sys, zipfile, shutil
apk, dex = sys.argv[1], sys.argv[2]
# classes.dex sikistirilmadan degil, normal sikistirmayla eklenebilir;
# zipalign sonrasi hizalama korunur.
with zipfile.ZipFile(apk, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(dex, 'classes.dex')
print('   classes.dex eklendi')
PY

echo "[6/7] hizalaniyor (zipalign)"
"$BT/zipalign.exe" -f -p 4 "$B/base.apk" "$B/hizali.apk"

echo "[7/7] imzalaniyor (apksigner)"
KS="$KOK/imza.keystore"
if [ ! -f "$KS" ]; then
  echo "   imza anahtari uretiliyor (bir kez)"
  keytool -genkeypair -v -keystore "$KS" -alias muvekkilbilgi \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass muvekkilbilgi -keypass muvekkilbilgi \
    -dname "CN=Muvekkil Bilgi, OU=Dogrulayici, O=Muvekkil Bilgi, L=Ankara, C=TR" >/dev/null 2>&1
fi
"$BT/apksigner.bat" sign \
  --ks "$KS" --ks-pass pass:muvekkilbilgi --key-pass pass:muvekkilbilgi \
  --out "$D/MuvekkilBilgi-Dogrulayici.apk" "$B/hizali.apk"

"$BT/apksigner.bat" verify --verbose "$D/MuvekkilBilgi-Dogrulayici.apk"
echo ""
echo "TAMAM: $D/MuvekkilBilgi-Dogrulayici.apk"
ls -la "$D"
