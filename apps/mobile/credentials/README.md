# Release signing credentials

Keep upload keystores here so `expo prebuild` (which recreates `android/`) does not delete them.

## One-time setup

```bash
cd apps/mobile/credentials
keytool -genkeypair -v -storetype PKCS12 \
  -keystore spentd-upload.keystore -alias spentd \
  -keyalg RSA -keysize 2048 -validity 10000

cp keystore.properties.example keystore.properties
# edit passwords
```

Before a local release build, copy properties into the Android project root:

```bash
cp credentials/keystore.properties android/keystore.properties
# storeFile in that file should be: ../credentials/spentd-upload.keystore
cd android && ./gradlew assembleRelease
```

## GitHub Actions secrets

| Secret | Value |
|--------|--------|
| `SPENTD_UPLOAD_KEYSTORE_BASE64` | `base64 -w0 spentd-upload.keystore` |
| `SPENTD_UPLOAD_STORE_PASSWORD` | keystore password |
| `SPENTD_UPLOAD_KEY_ALIAS` | e.g. `spentd` |
| `SPENTD_UPLOAD_KEY_PASSWORD` | key password |

Do not commit `*.keystore` or `keystore.properties`.
