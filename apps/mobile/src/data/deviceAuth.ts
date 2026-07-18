import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { LocalDataError } from "./crypto";

/**
 * Prompt the OS lock screen / biometrics.
 * Returns true only when the user successfully authenticates.
 */
export async function verifyDeviceOwner(
  reason = "Verify it’s you to recover Spentd"
): Promise<void> {
  if (Platform.OS === "web") {
    // No real device lock on web — recovery that keeps data is unavailable.
    return;
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware || !isEnrolled) {
    // Still try authenticate — some devices allow device PIN via fallback.
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: "Cancel",
    // Allow device PIN / pattern after biometrics (or when biometrics unavailable)
    disableDeviceFallback: false,
    fallbackLabel: "Use phone passcode",
  });

  if (!result.success) {
    if (result.error === "user_cancel" || result.error === "system_cancel") {
      throw new LocalDataError("Cancelled.", 401);
    }
    if (result.error === "passcode_not_set" || result.error === "not_enrolled") {
      throw new LocalDataError(
        "Set a screen lock (PIN, pattern, or biometrics) on this phone to recover Spentd.",
        400
      );
    }
    throw new LocalDataError("Phone lock verification failed. Try again.", 401);
  }
}

export async function canUseDeviceAuth(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    // Even without biometrics, Android/iOS may support device PIN via fallback.
    return hasHardware || enrolled;
  } catch {
    return false;
  }
}
