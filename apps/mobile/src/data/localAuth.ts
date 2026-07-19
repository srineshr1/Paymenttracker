import { randomUUID } from "expo-crypto";
import {
  authBodySchema,
  changePasscodeSchema,
  updateUsernameSchema,
  type AuthResponse,
  type UserPublic,
} from "@paymenttracker/shared";
import {
  changeVaultPasscode,
  clearActiveDek,
  getStoredUserId,
  hasLocalVault,
  LocalDataError,
  resetPasscodeWithRecovery,
  setStoredUserId,
  setupVault,
  unlockVault,
  wipeVaultSecrets,
} from "./crypto";
import { getDb, wipeDatabaseTables, type UserRow } from "./db";
import { clearLastUsername, saveLastUsername } from "@/src/lib/secure";

function toPublic(row: UserRow): UserPublic {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  };
}

async function getUserByUsername(username: string): Promise<UserRow | null> {
  const db = await getDb();
  return db.getFirstAsync<UserRow>(
    "SELECT id, username, created_at FROM users WHERE username = ?",
    [username.toLowerCase()]
  );
}

async function getUserById(id: string): Promise<UserRow | null> {
  const db = await getDb();
  return db.getFirstAsync<UserRow>(
    "SELECT id, username, created_at FROM users WHERE id = ?",
    [id]
  );
}

export async function registerLocal(
  usernameRaw: string,
  passcode: string
): Promise<AuthResponse> {
  const parsed = authBodySchema.safeParse({
    username: usernameRaw,
    passcode,
  });
  if (!parsed.success) {
    const msg =
      parsed.error.issues[0]?.message ?? "Invalid username or passcode";
    throw new LocalDataError(msg, 400);
  }

  const { username, passcode: pin } = parsed.data;

  // If a real user already exists, don't allow a second account
  if (await hasLocalAccount()) {
    throw new LocalDataError(
      "An account already exists on this device. Unlock with your passcode.",
      409
    );
  }

  // Orphan vault (secrets without a user) — clear so setup can proceed
  if (await hasLocalVault()) {
    await wipeVaultSecrets();
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  // Open DB first so a bad native handle surfaces before we write vault secrets
  const db = await getDb();
  try {
    await db.runAsync(
      "INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)",
      [id, username, createdAt]
    );
  } catch (err) {
    // Recover once from Expo Go Android flaky handle
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("NullPointerException") ||
      msg.includes("prepareAsync") ||
      msg.includes("NativeDatabase")
    ) {
      const { resetDbHandle } = await import("./db");
      await resetDbHandle();
      const db2 = await getDb();
      await db2.runAsync(
        "INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)",
        [id, username, createdAt]
      );
    } else {
      throw err;
    }
  }

  try {
    await setupVault(pin, id);
  } catch (err) {
    // Roll back user row if vault setup fails
    try {
      const db3 = await getDb();
      await db3.runAsync("DELETE FROM users WHERE id = ?", [id]);
    } catch {
      /* ignore */
    }
    throw err;
  }

  await saveLastUsername(username);

  const user = toPublic({ id, username, created_at: createdAt });
  return { token: randomUUID(), user };
}

export async function loginLocal(
  usernameRaw: string,
  passcode: string
): Promise<AuthResponse> {
  const parsed = authBodySchema.safeParse({
    username: usernameRaw,
    passcode,
  });
  if (!parsed.success) {
    throw new LocalDataError("Invalid passcode.", 401);
  }

  const { username, passcode: pin } = parsed.data;
  const row = await getUserByUsername(username);
  if (!row) {
    throw new LocalDataError("Invalid passcode.", 401);
  }

  const storedId = await getStoredUserId();
  if (storedId && storedId !== row.id) {
    throw new LocalDataError("Invalid passcode.", 401);
  }

  await unlockVault(pin);
  await setStoredUserId(row.id);
  await saveLastUsername(row.username);

  return { token: randomUUID(), user: toPublic(row) };
}

/**
 * Unlock with passcode only — uses the single local account on this device.
 * Username was set once at registration and is not re-entered.
 */
export async function unlockWithPasscodeLocal(
  passcode: string
): Promise<AuthResponse> {
  if (!/^\d{6}$/.test(passcode)) {
    throw new LocalDataError("Passcode must be exactly 6 digits.", 400);
  }

  const storedId = await getStoredUserId();
  let row: UserRow | null = null;

  if (storedId) {
    row = await getUserById(storedId);
  }

  if (!row) {
    // Fallback: single-user install — take the only profile
    const db = await getDb();
    row = await db.getFirstAsync<UserRow>(
      "SELECT id, username, created_at FROM users ORDER BY created_at ASC LIMIT 1"
    );
  }

  if (!row) {
    throw new LocalDataError(
      "No account on this device. Create one first.",
      404
    );
  }

  await unlockVault(passcode);
  await setStoredUserId(row.id);
  await saveLastUsername(row.username);

  return { token: randomUUID(), user: toPublic(row) };
}

/**
 * True only when a real user profile exists in SQLite.
 * Orphan vault secrets (no user row) are wiped so the user can create an account.
 */
export async function hasLocalAccount(): Promise<boolean> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM users LIMIT 1"
    );
    if (row) return true;
  } catch {
    // DB unreadable — treat as no account so user can re-register
    return false;
  }

  // Broken state: SecureStore vault left over without a user → clean up
  if (await hasLocalVault()) {
    await wipeVaultSecrets();
    await clearLastUsername();
  }
  return false;
}

export async function meLocal(): Promise<{ user: UserPublic }> {
  const id = await getStoredUserId();
  if (!id) throw new LocalDataError("Not signed in", 401);
  const row = await getUserById(id);
  if (!row) throw new LocalDataError("User not found", 404);
  return { user: toPublic(row) };
}

export async function changePasscodeLocal(
  currentPasscode: string,
  newPasscode: string
): Promise<{ ok: true }> {
  const parsed = changePasscodeSchema.safeParse({
    currentPasscode,
    newPasscode,
  });
  if (!parsed.success) {
    throw new LocalDataError(
      parsed.error.issues[0]?.message ?? "Invalid passcode",
      400
    );
  }
  await changeVaultPasscode(
    parsed.data.currentPasscode,
    parsed.data.newPasscode
  );
  return { ok: true };
}

export async function updateUsernameLocal(
  usernameRaw: string,
  passcode: string
): Promise<AuthResponse> {
  const parsed = updateUsernameSchema.safeParse({
    username: usernameRaw,
    passcode,
  });
  if (!parsed.success) {
    throw new LocalDataError(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400
    );
  }

  const id = await getStoredUserId();
  if (!id) throw new LocalDataError("Not signed in", 401);

  // Verify passcode by unlocking (re-derive) — vault may already be open
  await unlockVault(parsed.data.passcode);

  const clash = await getUserByUsername(parsed.data.username);
  if (clash && clash.id !== id) {
    throw new LocalDataError("Username is already taken on this device.", 409);
  }

  const db = await getDb();
  await db.runAsync("UPDATE users SET username = ? WHERE id = ?", [
    parsed.data.username,
    id,
  ]);
  await saveLastUsername(parsed.data.username);

  const row = await getUserById(id);
  if (!row) throw new LocalDataError("User not found", 404);

  return { token: randomUUID(), user: toPublic(row) };
}

export function lockLocal(): void {
  clearActiveDek();
}

/**
 * After phone lock verification: set a new app passcode and unlock.
 * History is preserved (uses OS-protected recovery DEK).
 */
export async function resetPasscodeAfterDeviceAuth(
  newPasscode: string
): Promise<AuthResponse> {
  if (!/^\d{6}$/.test(newPasscode)) {
    throw new LocalDataError("Passcode must be exactly 6 digits.", 400);
  }

  await resetPasscodeWithRecovery(newPasscode);

  const storedId = await getStoredUserId();
  let row: UserRow | null = storedId ? await getUserById(storedId) : null;
  if (!row) {
    const db = await getDb();
    row = await db.getFirstAsync<UserRow>(
      "SELECT id, username, created_at FROM users ORDER BY created_at ASC LIMIT 1"
    );
  }
  if (!row) {
    throw new LocalDataError("No account found after reset.", 404);
  }

  await setStoredUserId(row.id);
  await saveLastUsername(row.username);
  return { token: randomUUID(), user: toPublic(row) };
}

/**
 * After phone lock verification: wipe vault secrets + all local tables.
 * User returns to create-account flow.
 */
export async function clearAllLocalData(): Promise<void> {
  await wipeDatabaseTables();
  await wipeVaultSecrets();
  await clearLastUsername();
  try {
    const { clearWallets } = await import("./cash");
    await clearWallets();
  } catch {
    /* ignore */
  }
  // Keep categories via migrate seed on next open
  await getDb();
}

/**
 * After phone lock: delete expenses only, then force a new passcode.
 * Keeps username / account row.
 */
export async function clearHistoryAndResetPasscode(
  newPasscode: string
): Promise<AuthResponse> {
  if (!/^\d{6}$/.test(newPasscode)) {
    throw new LocalDataError("Passcode must be exactly 6 digits.", 400);
  }

  const db = await getDb();
  await db.execAsync("DELETE FROM expenses;");

  // Prefer recovery reset (same DEK, empty history is fine).
  // If recovery missing, wipe vault and re-setup for same user.
  try {
    return await resetPasscodeAfterDeviceAuth(newPasscode);
  } catch {
    const storedId = await getStoredUserId();
    let row: UserRow | null = storedId ? await getUserById(storedId) : null;
    if (!row) {
      row = await db.getFirstAsync<UserRow>(
        "SELECT id, username, created_at FROM users ORDER BY created_at ASC LIMIT 1"
      );
    }
    if (!row) {
      throw new LocalDataError("No account on this device.", 404);
    }
    await wipeVaultSecrets();
    await setupVault(newPasscode, row.id);
    await saveLastUsername(row.username);
    return { token: randomUUID(), user: toPublic(row) };
  }
}
