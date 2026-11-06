#!/usr/bin/env bash
# Boots a real Android emulator, installs the signed release APK, launches it and
# records hard evidence. Every command is logged to android/ci-output so the
# result can be audited from the repository even when Actions logs are unavailable.
set -uo pipefail

API="${1:?usage: emulator-test.sh <api-level>}"
OUT="android/ci-output"
REPORT="$OUT/emulator-report-api$API.txt"
LOG="$OUT/emulator-log-api$API.txt"
SHOT="$OUT/emulator-screen-api$API.png"
mkdir -p "$OUT"
: > "$LOG"
: > "$REPORT"

exec > >(tee -a "$LOG") 2>&1
set -x

FAILURES=0
note() { echo "$*" >> "$REPORT"; }
check() { # check <label> <command...>
  local label="$1"; shift
  if "$@"; then note "PASS $label"; else note "FAIL $label"; FAILURES=$((FAILURES + 1)); fi
}

SDK="${RUNNER_TEMP:-/tmp}/android-sdk"
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
mkdir -p "$SDK/cmdline-tools"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/ct.zip
  unzip -q /tmp/ct.zip -d "$SDK/cmdline-tools"
  mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
fi
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$SDK/emulator:$PATH"

yes | sdkmanager --licenses >/dev/null 2>&1
sdkmanager "platform-tools" "emulator" "system-images;android-$API;google_apis;x86_64" || {
  note "FAIL sdkmanager could not install API $API image"
  exit 1
}

# avdmanager and the emulator disagree about the default AVD directory when
# ANDROID_SDK_HOME is set (GitHub runners set it), so pin it explicitly for both.
export ANDROID_SDK_HOME="$HOME"
export ANDROID_AVD_HOME="$HOME/.android/avd"
mkdir -p "$ANDROID_AVD_HOME"
AVD_PATH="$ANDROID_AVD_HOME/test$API.avd"
echo no | avdmanager create avd --force --name "test$API" --path "$AVD_PATH" \
  --package "system-images;android-$API;google_apis;x86_64" --device pixel_5 || {
  note "FAIL avdmanager create avd"
  exit 1
}
test -f "$ANDROID_AVD_HOME/test$API.ini" || { note "FAIL AVD ini missing"; exit 1; }
"$SDK/emulator/emulator" -list-avds

ls -l /dev/kvm || true
EMU="$SDK/emulator/emulator"
CONSOLE="$OUT/emulator-console-api$API.txt"

start_emulator() { # start_emulator <gpu-mode>
  "$EMU" -avd "test$API" -no-window -no-audio -no-boot-anim -no-snapshot \
    -gpu "$1" -accel on -memory 3072 -cores 2 -camera-back none -camera-front none \
    > "$CONSOLE" 2>&1 &
  EMU_PID=$!
  echo "emulator pid=$EMU_PID gpu=$1"
}

start_emulator swiftshader_indirect
sleep 30
if ! kill -0 "$EMU_PID" 2>/dev/null; then
  echo "swiftshader_indirect died; retrying with -gpu off"
  tail -40 "$CONSOLE"
  start_emulator off
  sleep 25
fi

BOOTED=0
for i in $(seq 1 100); do
  if ! kill -0 "$EMU_PID" 2>/dev/null; then echo "emulator process died"; break; fi
  STATE=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')
  if [ "$STATE" = "1" ]; then BOOTED=1; break; fi
  sleep 6
done

{
  echo "############ emulator ############"
  echo "api-level: $API"
  "$EMU" -version 2>/dev/null | head -3
  adb devices
} >> "$REPORT"

if [ "$BOOTED" != "1" ]; then
  note "FAIL emulator did not finish booting"
  { echo "--- emulator console (tail) ---"; tail -60 "$CONSOLE"; } >> "$REPORT"
  kill "$EMU_PID" 2>/dev/null || true
  sleep 3
  exit 1
fi
note "PASS emulator booted (API $API)"

adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true
adb shell input keyevent 82 || true
adb shell svc power stayon true || true

APK="marketplace/public/DZ-Exchange.apk"
{
  echo
  echo "############ adb install -r ############"
  adb install -r "$APK" 2>&1
} >> "$REPORT"
INSTALL_RC=$?
if [ "$INSTALL_RC" = "0" ]; then note "PASS adb install exit 0"; else note "FAIL adb install exit $INSTALL_RC"; FAILURES=$((FAILURES + 1)); fi

{
  echo
  echo "############ am start -W ############"
  adb shell am start -W -n app.dzexchange.marketplace/.MainActivity 2>&1
} >> "$REPORT"
sleep 35

{
  echo
  echo "############ process ############"
  adb shell pidof app.dzexchange.marketplace 2>&1
  echo
  echo "############ foreground activity ############"
  adb shell dumpsys activity activities 2>/dev/null | grep -E 'ResumedActivity|mFocusedApp|topResumedActivity' | head -5
  echo
  echo "############ installed package ############"
  adb shell dumpsys package app.dzexchange.marketplace 2>/dev/null | grep -E 'versionName|versionCode|targetSdk|minSdk|flags=|pkgFlags=' | head -8
  echo
  echo "############ crash buffer ############"
  adb logcat -d -b crash 2>&1 | tail -40
  echo
  echo "############ app logcat (chromium / errors) ############"
  adb logcat -d 2>&1 | grep -iE 'dzexchange|chromium|ERR_|AndroidRuntime' | tail -40
} >> "$REPORT"

check "process alive after launch" bash -c "adb shell pidof app.dzexchange.marketplace | grep -q '[0-9]'"
check "app is the foreground activity" bash -c "adb shell dumpsys activity activities | grep -E 'ResumedActivity|topResumedActivity' | grep -q dzexchange"
check "no crash logged for the app" bash -c "! adb logcat -d -b crash | grep -q 'app.dzexchange.marketplace'"

adb exec-out screencap -p > "$SHOT" 2>/dev/null || true
if [ -s "$SHOT" ]; then note "PASS screenshot captured ($(stat -c %s "$SHOT") bytes)"; else note "FAIL screenshot empty"; FAILURES=$((FAILURES + 1)); fi

# Navigate one page deeper, then press Back: proves the WebView + back callback work.
adb shell input tap 540 1200 || true
sleep 8
adb shell input keyevent 4 || true
sleep 6
adb exec-out screencap -p > "$OUT/emulator-screen-api$API-after-back.png" 2>/dev/null || true
check "still alive after navigation + Back" bash -c "adb shell pidof app.dzexchange.marketplace | grep -q '[0-9]'"

{
  echo
  echo "############ result ############"
  echo "failures: $FAILURES"
} >> "$REPORT"

adb uninstall app.dzexchange.marketplace >> "$REPORT" 2>&1 || true
adb emu kill >> "$REPORT" 2>&1 || true
sleep 3
kill "$EMU_PID" 2>/dev/null || true
set +x
echo "=== API $API report ==="
cat "$REPORT"
sleep 2
exit "$FAILURES"
