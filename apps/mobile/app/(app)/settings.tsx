import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/src/components/AppHeader";
import { AppLogo } from "@/src/components/AppLogo";
import { Card, Screen, Segmented, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, preference, setPreference, mode, isDark } = useTheme();
  const { user, logout } = useAuth();

  const initial = (user?.username?.trim()?.[0] ?? "?").toUpperCase();
  const modeLabel =
    preference === "system"
      ? `System · ${mode === "dark" ? "Dark" : "Light"}`
      : mode === "dark"
        ? "Dark mode"
        : "Light mode";

  const onSignOut = () => {
    Alert.alert("Lock Spentd?", "You’ll need your passcode to unlock again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Lock",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Settings" subtitle="Appearance & account" />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xxxl,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <Card
          variant="hero"
          style={[
            styles.profileCard,
            {
              backgroundColor: isDark ? colors.bgElevated : colors.heroWash,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: colors.accentSoft,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={{
                fontFamily: typography.fontDisplayBold,
                fontSize: 28,
                color: colors.accentStrong,
                lineHeight: 34,
              }}
            >
              {initial}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text variant="label">Signed in as</Text>
            <Text
              style={{
                fontFamily: typography.fontDisplayBold,
                fontSize: 28,
                lineHeight: 34,
                letterSpacing: -0.5,
                color: colors.text,
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {user?.username ?? "—"}
            </Text>
            <Text muted style={{ marginTop: spacing.sm, fontSize: 13 }}>
              Passcode is never stored — it only unlocks encrypted data on this
              device.
            </Text>
          </View>
        </Card>

        {/* Appearance */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" style={{ marginLeft: 4 }}>
            Appearance
          </Text>
          <Card variant="elevated" style={styles.sectionCard}>
            <View style={styles.sectionHead}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: colors.accentSoft,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name={mode === "dark" ? "moon" : "sunny"}
                  size={18}
                  color={colors.accentStrong}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: typography.fontSansSemi,
                    fontSize: 16,
                    color: colors.text,
                  }}
                >
                  {modeLabel}
                </Text>
                <Text muted style={{ fontSize: 13, marginTop: 2 }}>
                  Warm paper in light · ink & gold in dark
                </Text>
              </View>
            </View>
            <Segmented
              value={preference}
              onChange={(v) =>
                setPreference(v as "system" | "light" | "dark")
              }
              options={[
                { label: "System", value: "system" },
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
              ]}
            />
          </Card>
        </View>

        {/* Account */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" style={{ marginLeft: 4 }}>
            Account
          </Text>
          <Card variant="elevated" style={styles.listCard}>
            <SettingsRow
              icon="person-outline"
              title="Edit username"
              subtitle="Change how you appear"
              onPress={() => router.push("/(app)/edit-username")}
            />
            <RowDivider />
            <SettingsRow
              icon="key-outline"
              title="Change passcode"
              subtitle="Update your 6-digit code"
              onPress={() => router.push("/(app)/change-passcode")}
            />
            <RowDivider />
            <SettingsRow
              icon="lock-closed-outline"
              title="Lock now"
              subtitle="Require passcode again"
              onPress={() => {
                logout();
                router.replace("/(auth)/login");
              }}
            />
          </Card>
        </View>

        {/* Sign out */}
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Lock app"
          style={({ pressed }) => [
            styles.signOutBtn,
            {
              backgroundColor: colors.dangerSoft,
              borderColor: isDark
                ? "rgba(217,123,123,0.28)"
                : "rgba(181,74,74,0.22)",
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Ionicons name="lock-closed-outline" size={18} color={colors.danger} />
          <Text
            style={{
              fontFamily: typography.fontSansSemi,
              fontSize: 15,
              color: colors.danger,
            }}
          >
            Lock app
          </Text>
        </Pressable>

        <View style={styles.brandFooter}>
          <AppLogo size={28} />
          <Text
            muted
            style={{
              textAlign: "center",
              fontSize: 12,
              marginTop: spacing.sm,
            }}
          >
            Spentd · v1.0
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function RowDivider() {
  const { colors } = useTheme();
  return (
    <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
  );
}

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.bgMuted, opacity: 0.95 },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: colors.bgMuted,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.rowText}>
        <Text
          style={{
            fontFamily: typography.fontSansSemi,
            fontSize: 15,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        <Text muted style={{ fontSize: 12, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  sectionCard: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  listCard: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 40 + spacing.md + spacing.md,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  brandFooter: {
    alignItems: "center",
    marginTop: spacing.sm,
    gap: 2,
  },
});
