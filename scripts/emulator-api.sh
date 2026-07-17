#!/usr/bin/env bash
# Tunnel host API :3001 into the Android emulator as 127.0.0.1:3001
set -euo pipefail

if ! command -v adb >/dev/null; then
  echo "adb not found. Install Android platform-tools."
  exit 1
fi

if ! adb devices | grep -qE 'emulator-[0-9]+\s+device'; then
  echo "No running emulator found. Start your AVD first."
  adb devices
  exit 1
fi

adb reverse tcp:3001 tcp:3001
adb reverse tcp:8081 tcp:8081
echo "OK — emulator can reach host API at http://127.0.0.1:3001"
echo "    and Expo at http://127.0.0.1:8081"
adb reverse --list
echo
echo "Set apps/mobile/.env to:"
echo "  EXPO_PUBLIC_API_URL=http://127.0.0.1:3001"
echo "Then restart Expo: cd apps/mobile && npx expo start -c"
