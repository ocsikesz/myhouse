#!/bin/bash
# Instalează APK-ul pe emulator, îl pornește și salvează logcat-ul.
# Folosire: smoke-test.sh <apk> <director-ieșire>
APK="$1"; OUT="$2"; PKG=ro.ocsike.indexa
mkdir -p "$OUT"
adb install -r "$APK" > "$OUT/install.txt" 2>&1
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb logcat -c
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
sleep 45
adb exec-out screencap -p > "$OUT/screen.png" || true
if adb shell pidof $PKG > /dev/null; then echo "ALIVE" > "$OUT/status.txt"; else echo "DEAD" > "$OUT/status.txt"; fi
adb logcat -d > "$OUT/logcat-full.txt"
grep -E "AndroidRuntime|FATAL|ReactNativeJS|ReactNative|Expo|$PKG|libc  |DEBUG   :" "$OUT/logcat-full.txt" > "$OUT/logcat.txt" || true
# a doua pornire (după primul crash, unele probleme apar doar la restart)
adb logcat -c
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
sleep 20
if adb shell pidof $PKG > /dev/null; then echo "ALIVE" > "$OUT/status2.txt"; else echo "DEAD" > "$OUT/status2.txt"; fi
adb logcat -d | grep -E "AndroidRuntime|FATAL|ReactNativeJS|$PKG" > "$OUT/logcat2.txt" || true
# Capturi cu date demo: ecranul contorului și Istoric
adb shell am start -W -a android.intent.action.VIEW -d "indexa://demo" $PKG > /dev/null 2>&1
sleep 12
adb exec-out screencap -p > "$OUT/screen-contor.png" || true
SIZE=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
X=$((W / 2)); Y1=$((H * 8 / 10)); Y2=$((H * 2 / 10))
adb shell input swipe $X $Y1 $X $Y2 400
sleep 2
adb exec-out screencap -p > "$OUT/screen-contor-2.png" || true
adb shell input swipe $X $Y1 $X $Y2 400
sleep 2
adb exec-out screencap -p > "$OUT/screen-contor-3.png" || true
adb shell am start -W -a android.intent.action.VIEW -d "indexa://demo?go=istoric" $PKG > /dev/null 2>&1
sleep 10
adb exec-out screencap -p > "$OUT/screen-istoric.png" || true
if adb shell pidof $PKG > /dev/null; then echo "ALIVE" > "$OUT/status3.txt"; else echo "DEAD" > "$OUT/status3.txt"; fi

# OCR pe poza sintetică de contor
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "indexa://demo?go=ocr" $PKG > /dev/null 2>&1
sleep 20
adb exec-out screencap -p > "$OUT/screen-ocr.png" || true
adb logcat -d | grep -E "OCR-TEST|AndroidRuntime|FATAL" > "$OUT/ocr.txt" || true
adb logcat -d | grep -E "AndroidRuntime|FATAL|ReactNativeJS" > "$OUT/logcat3.txt" || true
exit 0
