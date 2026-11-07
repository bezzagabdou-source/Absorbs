#!/usr/bin/env bash
#
# Creates the permanent release signing key for DZ Exchange (once, ever).
#
#   ./android/gen-keystore.sh
#
# The store password comes from $DZ_KEYSTORE_PASSWORD, or from
# android/signing.properties when that file already exists. Both
# android/release.keystore and android/signing.properties are git-ignored:
# back them up offline (password manager + encrypted copy). Losing the key means
# every future update has a different signature and Android refuses to install it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYSTORE="$ROOT/release.keystore"
PROPS="$ROOT/signing.properties"
ALIAS="dzexchange"

if [ -f "$KEYSTORE" ]; then
  echo "android/release.keystore already exists — refusing to overwrite the release key." >&2
  exit 1
fi

PASSWORD="${DZ_KEYSTORE_PASSWORD:-}"
if [ -z "$PASSWORD" ] && [ -f "$PROPS" ]; then
  PASSWORD="$(sed -n 's/^storePassword=//p' "$PROPS" | head -1)"
fi
if [ -z "$PASSWORD" ]; then
  PASSWORD="$(python3 -c "import secrets,string;alphabet=string.ascii_letters+string.digits;print(''.join(secrets.choice(alphabet) for _ in range(32)))")"
  echo "Generated a new random keystore password."
fi

if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/keytool" ]; then
  KEYTOOL="$JAVA_HOME/bin/keytool"
elif command -v keytool >/dev/null 2>&1; then
  KEYTOOL="$(command -v keytool)"
else
  KEYTOOL="$HOME/.jdk4py/lib/python3.11/site-packages/jdk4py/java-runtime/bin/keytool"
fi
[ -x "$KEYTOOL" ] || { echo "keytool not found (install a JDK or 'pip install jdk4py')." >&2; exit 3; }

"$KEYTOOL" -genkeypair \
  -keystore "$KEYSTORE" -storetype PKCS12 \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass "$PASSWORD" -keypass "$PASSWORD" \
  -dname "CN=DZ Exchange, OU=Mobile, O=DZ Exchange, L=Algiers, ST=Algiers, C=DZ"

cat > "$PROPS" <<EOF
# Local signing credentials — NEVER commit. Keep an offline backup with the keystore.
storeFile=$KEYSTORE
storePassword=$PASSWORD
keyAlias=$ALIAS
keyPassword=$PASSWORD
EOF
chmod 600 "$KEYSTORE" "$PROPS"

echo ""
echo "✓ android/release.keystore + android/signing.properties created (mode 600)."
echo "  Back both files up offline now. Losing them blocks all future updates."
echo ""
echo "  SHA-256 certificate fingerprint (for reference / Play App Signing):"
"$KEYTOOL" -list -v -keystore "$KEYSTORE" -storepass "$PASSWORD" -alias "$ALIAS" 2>/dev/null | grep -E "SHA256:|SHA1:" | sed 's/^[[:space:]]*/  /'
