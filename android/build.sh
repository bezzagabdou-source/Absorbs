#!/usr/bin/env bash
#
# Builds and signs the DZ Exchange release APK.
#
#   ./android/build.sh                 # requires android/release.keystore
#   ./android/build.sh --allow-debug   # falls back to a throwaway key (never publish such a build)
#
# Everything is local and reproducible: aapt2 → javac (ECJ) → d8 → zipalign →
# apksigner (v1+v2+v3). Output: android/build/DZ-Exchange-<version>.apk
#
# Signing key: android/release.keystore (PKCS12) with credentials in
# android/signing.properties. Both are git-ignored on purpose; keep an offline
# backup — without it, no future update can ever be installed over this app.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$ROOT/build"
TOOLS="$ROOT/tools"
APP="$ROOT/app/src/main"
VERSION_NAME="${APP_VERSION_NAME:-1.1}"
VERSION_CODE="${APP_VERSION_CODE:-2}"

ALLOW_DEBUG=0
for arg in "$@"; do
  case "$arg" in
    --allow-debug) ALLOW_DEBUG=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# ---- toolchain -----------------------------------------------------------------
if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
  JAVA="$JAVA_HOME/bin/java"
elif command -v java >/dev/null 2>&1; then
  JAVA="$(command -v java)"
else
  # jdk4py ships a JRE-only runtime (java + keytool) which is enough here.
  JDK_PY="$(JDK4PY="$HOME/.jdk4py/bin/python" python3 -c "" 2>/dev/null; "$HOME/.jdk4py/bin/python" -c "import jdk4py,os;print(os.path.join(jdk4py.JAVA_HOME,'bin','java'))" 2>/dev/null || true)"
  if [ -n "$JDK_PY" ] && [ -x "$JDK_PY" ]; then JAVA="$JDK_PY"; else
    echo "No Java runtime found. Install a JRE/JDK (17+) or 'pip install jdk4py'." >&2; exit 3
  fi
fi

KEYTOOL="$(dirname "$JAVA")/keytool"
[ -x "$KEYTOOL" ] || KEYTOOL="$(command -v keytool || true)"

echo "▸ java: $JAVA"
"$JAVA" -version 2>&1 | head -1

for tool in aapt2 apksigner.jar d8.jar ecj.jar android.jar; do
  [ -e "$TOOLS/$tool" ] || { echo "Missing tool: android/tools/$tool" >&2; exit 3; }
done
[ -x "$TOOLS/aapt2" ] || chmod +x "$TOOLS/aapt2"

# ---- clean ---------------------------------------------------------------------
rm -rf "$BUILD"
mkdir -p "$BUILD/classes" "$BUILD/compiled" "$BUILD/gen" "$BUILD/dex"

# ---- resources -----------------------------------------------------------------
echo "▸ aapt2 compile + link"
"$TOOLS/aapt2" compile --dir "$APP/res" -o "$BUILD/compiled/res.zip"
"$TOOLS/aapt2" link \
  -o "$BUILD/base.apk" \
  -I "$TOOLS/android.jar" \
  --manifest "$APP/AndroidManifest.xml" \
  --min-sdk-version 23 \
  --target-sdk-version 35 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  --java "$BUILD/gen" \
  "$BUILD/compiled/res.zip"

# ---- java ----------------------------------------------------------------------
echo "▸ compile java (ECJ, source/target 8)"
SOURCES=$(find "$APP/java" "$BUILD/gen" -name '*.java')
"$JAVA" -jar "$TOOLS/ecj.jar" \
  -source 1.8 -target 1.8 -warn:none \
  -cp "$TOOLS/android.jar" \
  -d "$BUILD/classes" \
  $SOURCES

# ---- dex -----------------------------------------------------------------------
echo "▸ dex (d8)"
"$JAVA" -cp "$TOOLS/d8.jar" com.android.tools.r8.D8 \
  --release --min-api 23 \
  --lib "$TOOLS/android.jar" \
  --output "$BUILD/dex" \
  $(find "$BUILD/classes" -name '*.class')
cp "$BUILD/dex/classes.dex" "$BUILD/classes.dex"

# aapt2 already produced resources.arsc + res/*; add classes.dex (STORED, so it stays aligned later).
echo "▸ package"
(cd "$BUILD" && zip -q -j base.apk classes.dex)

# ---- align + sign --------------------------------------------------------------
echo "▸ zipalign"
node "$TOOLS/zipalign.mjs" "$BUILD/base.apk" "$BUILD/aligned.apk"

KEYSTORE="$ROOT/release.keystore"
PROPS="$ROOT/signing.properties"
if [ ! -f "$KEYSTORE" ] || [ ! -f "$PROPS" ]; then
  if [ "$ALLOW_DEBUG" -ne 1 ]; then
    echo "" >&2
    echo "Missing android/release.keystore or android/signing.properties." >&2
    echo "Create them once (keep an offline backup!) then re-run:" >&2
    echo "  ./android/gen-keystore.sh" >&2
    echo "" >&2
    exit 4
  fi
  echo "⚠ no release key found — generating a throwaway debug key"
  "$KEYTOOL" -genkeypair -keystore "$BUILD/debug.keystore" -storetype PKCS12 \
    -alias dzexchange -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass debug-only-2026 -keypass debug-only-2026 \
    -dname "CN=DZ Exchange Debug, O=DZ Exchange, C=DZ" >/dev/null 2>&1
  KEYSTORE="$BUILD/debug.keystore"
  printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=dzexchange\nkeyPassword=%s\n' \
    "$KEYSTORE" "debug-only-2026" "debug-only-2026" > "$BUILD/signing.properties"
  PROPS="$BUILD/signing.properties"
fi

set -a; . "$PROPS"; set +a
echo "▸ sign (v1 + v2 + v3)"
"$JAVA" -jar "$TOOLS/apksigner.jar" sign \
  --ks "$storeFile" --ks-key-alias "$keyAlias" \
  --ks-pass "pass:$storePassword" --key-pass "pass:$keyPassword" \
  --min-sdk-version 23 \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$BUILD/DZ-Exchange-$VERSION_NAME.apk" \
  "$BUILD/aligned.apk"

echo "▸ verify"
"$JAVA" -jar "$TOOLS/apksigner.jar" verify --verbose --min-sdk-version 23 "$BUILD/DZ-Exchange-$VERSION_NAME.apk" 2>/dev/null | grep -E "Verified using|Number of signers" || true

APK="$BUILD/DZ-Exchange-$VERSION_NAME.apk"
SHA=$(sha256sum "$APK" | cut -d' ' -f1)
SIZE=$(stat -c%s "$APK")
echo ""
echo "✓ $APK"
echo "  version   $VERSION_NAME ($VERSION_CODE)"
echo "  size      $SIZE bytes"
echo "  sha256    $SHA"
printf '{ "versionName": "%s", "versionCode": %s, "bytes": %s, "sha256": "%s", "builtAt": "%s" }\n' \
  "$VERSION_NAME" "$VERSION_CODE" "$SIZE" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BUILD/apk-info.json"
echo "  info      $BUILD/apk-info.json"
