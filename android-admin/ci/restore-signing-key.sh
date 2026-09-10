#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_ADMIN_KEYSTORE_BASE64:?Missing Android signing key repository secret}"
: "${ANDROID_ADMIN_KEYSTORE_PASSWORD:?Missing Android signing password repository secret}"
: "${RUNNER_TEMP:?Missing runner temporary directory}"
: "${GITHUB_ENV:?Missing GitHub environment file}"
umask 077
keystore_path="$RUNNER_TEMP/market-cash-admin.p12"
printf '%s' "$ANDROID_ADMIN_KEYSTORE_BASE64" | base64 --decode > "$keystore_path"
printf 'ANDROID_ADMIN_KEYSTORE_PATH=%s\n' "$keystore_path" >> "$GITHUB_ENV"
