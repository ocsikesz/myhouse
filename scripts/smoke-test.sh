#!/bin/bash
# Instalează APK-ul pe emulator, îl pornește și salvează logcat-ul.
# Folosire: smoke-test.sh <apk> <director-ieșire>
APK="$1"; OUT="$2"; PKG=ro.ocsikesz.casamea
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
exit 0
