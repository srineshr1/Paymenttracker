import * as Crypto from "expo-crypto";
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Iterated SHA-512 rounds for passcode → key derivation (offline PIN). */
const KDF_ITERS = 8_000;

const KEYS = {
  salt: "pt.pass.salt",
  verifier: "pt.pass.verifier",
  wrappedDek: "pt.dek.wrapped",
  /** DEK hex — only readable after device biometrics / lock screen. */
  recoveryDek: "pt.dek.recovery",
  userId: "pt.user.id",
  failCount: "pt.pass.fails",
  failUntil: "pt.pass.fail_until",
} as const;

/**
 * Recovery DEK is stored in the OS secure enclave / Keystore.
 * Access is gated in app code by LocalAuthentication (phone lock) before read.
 * We avoid SecureStore requireAuthentication here so the user gets one prompt
 * (device PIN / biometrics via expo-local-authentication) instead of two.
 */
const RECOVERY_SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** In-memory DEK — cleared on lock / logout. Never written plaintext to disk. */
let activeDek: AESEncryptionKey | null = null;

export function isUnlocked(): boolean {
  return activeDek != null;
}

export function getActiveDek(): AESEncryptionKey {
  if (!activeDek) {
    throw new LocalDataError("Vault is locked. Enter your passcode.", 401);
  }
  return activeDek;
}

export function clearActiveDek(): void {
  activeDek = null;
}

async function setSecure(
  key: string,
  value: string,
  options?: SecureStore.SecureStoreOptions,
) {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value, options);
}

async function getSecure(
  key: string,
  options?: SecureStore.SecureStoreOptions,
): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key, options);
}

async function deleteSecure(key: string) {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function copyBytes(src: Uint8Array): Uint8Array {
  // Defensive copy — some native bridges mishandle views / shared buffers.
  return Uint8Array.from(src);
}

async function deriveKek(
  passcode: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const pin = String(passcode ?? "").trim();
  const saltBytes = copyBytes(salt);
  const passBytes = new TextEncoder().encode(pin);
  const material = new Uint8Array(passBytes.length + saltBytes.length);
  material.set(passBytes, 0);
  material.set(saltBytes, passBytes.length);

  let hash = copyBytes(
    new Uint8Array(
      await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA512,
        material as BufferSource,
      ),
    ),
  );
  for (let i = 1; i < KDF_ITERS; i++) {
    hash = copyBytes(
      new Uint8Array(
        await Crypto.digest(
          Crypto.CryptoDigestAlgorithm.SHA512,
          hash as BufferSource,
        ),
      ),
    );
  }
  return copyBytes(hash.subarray(0, 32));
}

async function makeVerifier(kek: Uint8Array): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA512,
    `${bytesToHex(kek)}:pt-verify-v1`,
  );
}

async function wrapDek(
  dek: AESEncryptionKey,
  kek: Uint8Array,
): Promise<string> {
  const wrapKey = await AESEncryptionKey.import(copyBytes(kek));
  const dekBytes = copyBytes(await dek.bytes());
  const sealed = await aesEncryptAsync(dekBytes, wrapKey);
  // Hex avoids any base64 (+, /, =) edge cases in SecureStore.
  const combined = copyBytes(await sealed.combined("bytes"));
  return `hex:${bytesToHex(combined)}`;
}

async function unwrapDek(
  wrapped: string,
  kek: Uint8Array,
): Promise<AESEncryptionKey> {
  const wrapKey = await AESEncryptionKey.import(copyBytes(kek));
  let combined: Uint8Array | string = wrapped;
  if (wrapped.startsWith("hex:")) {
    combined = hexToBytes(wrapped.slice(4));
  }
  const sealed = AESSealedData.fromCombined(combined, {
    ivLength: 12,
    tagLength: 16,
  });
  const plain = await aesDecryptAsync(sealed, wrapKey, { output: "bytes" });
  return AESEncryptionKey.import(copyBytes(plain));
}

/** Persist DEK for device-auth recovery (biometrics / lock screen). */
export async function saveRecoveryDek(dek: AESEncryptionKey): Promise<void> {
  if (Platform.OS === "web") {
    // Web has no device lock — skip recovery key (clear-only recovery).
    return;
  }
  try {
    const hex = await dek.encoded("hex");
    await setSecure(KEYS.recoveryDek, hex as string, RECOVERY_SECURE_OPTIONS);
  } catch {
    // Emulators / devices without secure hardware may fail — clear still works.
  }
}

/**
 * Read recovery DEK. Call only after LocalAuthentication (phone lock) succeeds.
 */
export async function loadRecoveryDek(): Promise<AESEncryptionKey> {
  if (Platform.OS === "web") {
    throw new LocalDataError(
      "Passcode recovery that keeps your data needs a phone. You can still clear all data.",
      501,
    );
  }

  try {
    const hex = await getSecure(KEYS.recoveryDek, RECOVERY_SECURE_OPTIONS);
    if (!hex) {
      throw new LocalDataError(
        "No recovery key found. Unlock once with your passcode to enable recovery, or clear all data.",
        404,
      );
    }
    return AESEncryptionKey.import(hex, "hex");
  } catch (e) {
    if (e instanceof LocalDataError) throw e;
    throw new LocalDataError(
      "Could not load recovery key. Try again, or clear all data.",
      401,
    );
  }
}

export async function hasRecoveryDek(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const hex = await getSecure(KEYS.recoveryDek, RECOVERY_SECURE_OPTIONS);
    return Boolean(hex);
  } catch {
    return false;
  }
}

/** Rate-limit failed passcode attempts (device-local). */
export async function assertNotRateLimited(): Promise<void> {
  const until = await getSecure(KEYS.failUntil);
  if (!until) return;
  const ts = Number(until);
  if (Number.isFinite(ts) && Date.now() < ts) {
    const secs = Math.ceil((ts - Date.now()) / 1000);
    throw new LocalDataError(`Too many attempts. Try again in ${secs}s.`, 429);
  }
}

async function recordFailedAttempt(): Promise<void> {
  const raw = await getSecure(KEYS.failCount);
  const count = (Number(raw) || 0) + 1;
  await setSecure(KEYS.failCount, String(count));
  if (count >= 5) {
    const backoffMs = Math.min(60_000, 5_000 * 2 ** (count - 5));
    await setSecure(KEYS.failUntil, String(Date.now() + backoffMs));
  }
}

async function clearFailedAttempts(): Promise<void> {
  await deleteSecure(KEYS.failCount);
  await deleteSecure(KEYS.failUntil);
}

export async function hasLocalVault(): Promise<boolean> {
  const salt = await getSecure(KEYS.salt);
  const wrapped = await getSecure(KEYS.wrappedDek);
  return Boolean(salt && wrapped);
}

export async function getStoredUserId(): Promise<string | null> {
  return getSecure(KEYS.userId);
}

export async function setStoredUserId(id: string): Promise<void> {
  await setSecure(KEYS.userId, id);
}

async function rewrapDekWithPasscode(
  dek: AESEncryptionKey,
  passcode: string,
): Promise<void> {
  const pin = String(passcode ?? "").trim();
  if (!/^\d{6}$/.test(pin)) {
    throw new LocalDataError("Passcode must be exactly 6 digits.", 400);
  }
  const newSalt = copyBytes(await Crypto.getRandomBytesAsync(16));
  const newKek = await deriveKek(pin, newSalt);
  const newVerifier = await makeVerifier(newKek);
  const newWrapped = await wrapDek(dek, newKek);

  await setSecure(KEYS.salt, bytesToHex(newSalt));
  await setSecure(KEYS.verifier, newVerifier);
  await setSecure(KEYS.wrappedDek, newWrapped);
  await saveRecoveryDek(dek);
  await clearFailedAttempts();
  activeDek = dek;
}

/**
 * First-time setup: generate DEK, wrap with passcode-derived KEK, store verifier.
 * Verifies a full lock→unlock round-trip before returning so a bad wrap
 * can never leave the user with a passcode that won't unlock later.
 */
export async function setupVault(
  passcode: string,
  userId: string,
): Promise<void> {
  const pin = String(passcode ?? "").trim();
  if (!/^\d{6}$/.test(pin)) {
    throw new LocalDataError("Passcode must be exactly 6 digits.", 400);
  }

  const salt = copyBytes(await Crypto.getRandomBytesAsync(16));
  const kek = await deriveKek(pin, salt);
  const verifier = await makeVerifier(kek);
  const dek = await AESEncryptionKey.generate();
  const wrapped = await wrapDek(dek, kek);

  await setSecure(KEYS.salt, bytesToHex(salt));
  await setSecure(KEYS.verifier, verifier);
  await setSecure(KEYS.wrappedDek, wrapped);
  await setSecure(KEYS.userId, userId);
  await saveRecoveryDek(dek);
  await clearFailedAttempts();

  // Prove the stored material unlocks with the same PIN before we finish.
  activeDek = null;
  const salt2 = hexToBytes((await getSecure(KEYS.salt)) ?? "");
  const verifier2 = await getSecure(KEYS.verifier);
  const wrapped2 = await getSecure(KEYS.wrappedDek);
  if (!verifier2 || !wrapped2) {
    throw new LocalDataError("Could not persist vault. Try again.", 500);
  }
  const kek2 = await deriveKek(pin, salt2);
  const check = await makeVerifier(kek2);
  if (check !== verifier2) {
    await wipeVaultSecrets();
    throw new LocalDataError(
      "Passcode setup failed verification. Try again.",
      500,
    );
  }
  try {
    activeDek = await unwrapDek(wrapped2, kek2);
  } catch {
    await wipeVaultSecrets();
    throw new LocalDataError(
      "Passcode setup failed to seal the vault. Try again.",
      500,
    );
  }
}

/**
 * Unlock vault with passcode. Loads DEK into memory on success.
 * Migrates recovery DEK if missing (older installs).
 */
export async function unlockVault(passcode: string): Promise<void> {
  await assertNotRateLimited();

  const pin = String(passcode ?? "").trim();
  if (!/^\d{6}$/.test(pin)) {
    throw new LocalDataError("Passcode must be exactly 6 digits.", 400);
  }

  const saltHex = await getSecure(KEYS.salt);
  const verifier = await getSecure(KEYS.verifier);
  const wrapped = await getSecure(KEYS.wrappedDek);
  if (!saltHex || !verifier || !wrapped) {
    throw new LocalDataError(
      "No local account on this device. Create one first.",
      404,
    );
  }

  const salt = hexToBytes(saltHex);
  const kek = await deriveKek(pin, salt);
  const check = await makeVerifier(kek);
  if (check !== verifier) {
    await recordFailedAttempt();
    throw new LocalDataError("Incorrect passcode.", 401);
  }

  try {
    activeDek = await unwrapDek(wrapped, kek);
  } catch {
    // Verifier matched but unwrap failed — storage/format problem, not the PIN.
    await recordFailedAttempt();
    throw new LocalDataError(
      "Vault data is unreadable. Use Forgot passcode to reset.",
      500,
    );
  }
  await clearFailedAttempts();

  // Migrate legacy base64 wraps → hex on successful unlock
  if (!wrapped.startsWith("hex:")) {
    try {
      const migrated = await wrapDek(activeDek, kek);
      await setSecure(KEYS.wrappedDek, migrated);
    } catch {
      /* keep legacy wrap */
    }
  }

  // Ensure recovery key exists for forgot-passcode flow
  try {
    await saveRecoveryDek(activeDek);
  } catch {
    /* ignore */
  }
}

/**
 * Re-wrap DEK under a new passcode (after verifying current).
 */
export async function changeVaultPasscode(
  currentPasscode: string,
  newPasscode: string,
): Promise<void> {
  await assertNotRateLimited();

  const saltHex = await getSecure(KEYS.salt);
  const verifier = await getSecure(KEYS.verifier);
  const wrapped = await getSecure(KEYS.wrappedDek);
  if (!saltHex || !verifier || !wrapped) {
    throw new LocalDataError("No local account on this device.", 404);
  }

  const oldSalt = hexToBytes(saltHex);
  const oldKek = await deriveKek(currentPasscode, oldSalt);
  const check = await makeVerifier(oldKek);
  if (check !== verifier) {
    await recordFailedAttempt();
    throw new LocalDataError("Current passcode is incorrect.", 401);
  }

  let dek = activeDek;
  if (!dek) {
    dek = await unwrapDek(wrapped, oldKek);
  }

  await rewrapDekWithPasscode(dek, newPasscode);
}

/**
 * After device authentication: load recovery DEK and set a new app passcode.
 * Keeps all encrypted history.
 */
export async function resetPasscodeWithRecovery(
  newPasscode: string,
): Promise<void> {
  if (!/^\d{6}$/.test(newPasscode)) {
    throw new LocalDataError("Passcode must be exactly 6 digits.", 400);
  }
  const dek = await loadRecoveryDek();
  await rewrapDekWithPasscode(dek, newPasscode);
}

/** Remove all vault secrets from SecureStore and clear in-memory DEK. */
export async function wipeVaultSecrets(): Promise<void> {
  clearActiveDek();
  await deleteSecure(KEYS.salt);
  await deleteSecure(KEYS.verifier);
  await deleteSecure(KEYS.wrappedDek);
  await deleteSecure(KEYS.recoveryDek);
  await deleteSecure(KEYS.userId);
  await clearFailedAttempts();
}

/**
 * Android native AESSealedData.fromCombined only accepts ByteArray — not
 * base64 strings (Kotlin Either conversion fails). Always pass bytes.
 */
function sealedToBytes(sealed: string): Uint8Array {
  if (sealed.startsWith("hex:")) {
    return hexToBytes(sealed.slice(4));
  }
  // legacy base64 combined blob
  const atobFn = globalThis.atob?.bind(globalThis);
  if (!atobFn) {
    throw new Error("base64 decode unavailable");
  }
  const bin = atobFn(sealed);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypt a UTF-8 string; returns hex:… combined IV+ciphertext+tag. */
export async function sealString(plaintext: string): Promise<string> {
  const dek = getActiveDek();
  const bytes = new TextEncoder().encode(plaintext);
  const sealed = await aesEncryptAsync(bytes, dek);
  const combined = copyBytes(await sealed.combined("bytes"));
  return `hex:${bytesToHex(combined)}`;
}

/** Decrypt a sealed string; null-safe for optional fields. */
export async function openString(
  sealedBlob: string | null | undefined,
): Promise<string | null> {
  if (sealedBlob == null || sealedBlob === "") return null;
  const dek = getActiveDek();
  const combined = copyBytes(sealedToBytes(sealedBlob));
  const sealed = AESSealedData.fromCombined(combined, {
    ivLength: 12,
    tagLength: 16,
  });
  const bytes = await aesDecryptAsync(sealed, dek, { output: "bytes" });
  return new TextDecoder().decode(bytes);
}

export async function sealNullable(
  value: string | null | undefined,
): Promise<string | null> {
  if (value == null || value === "") return null;
  return sealString(value);
}

/** Stable hash for UPI ref dedupe without storing plaintext ref. */
export async function hashUpiRef(
  userId: string,
  upiRef: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${userId}|upi|${upiRef.trim()}`,
  );
}

export class LocalDataError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status = 400, body: unknown = null) {
    super(message);
    this.name = "LocalDataError";
    this.status = status;
    this.body = body;
  }
}
