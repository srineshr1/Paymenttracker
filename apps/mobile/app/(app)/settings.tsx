import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Category } from "@paymenttracker/shared";
import { api, getApiBase } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { Button, Card, Screen, Segmented, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import { useAuth } from "@/src/features/auth/AuthContext";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, preference, setPreference, mode } = useTheme();
  const { user, logout, lock } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api
      .listCategories()
      .then((r) => setCategories(r.categories))
      .catch(() => undefined);
  }, []);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Settings" subtitle="Appearance, account & privacy" />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 40,
          gap: spacing.xl,
        }}
      >

        <Card variant="hero" style={{ gap: spacing.md }}>
          <Text variant="label">Appearance</Text>
          <Text variant="title">
            {mode === "dark" ? "Dark mode" : "Light mode"}
          </Text>
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
          <Text muted>
            Light uses warm paper tones; dark uses ink and gold. Your choice is
            saved on this device.
          </Text>
        </Card>

        <Card variant="accent" style={{ gap: spacing.md }}>
          <Text variant="label">Username</Text>
          <Text variant="hero" style={{ fontSize: 26 }}>
            {user?.username}
          </Text>
          <Text muted>
            Passcode is verified as a secure hash on the server. It is never
            saved on this device. You re-enter it every session.
          </Text>
        </Card>

        <Card variant="outline" style={{ gap: spacing.sm }}>
          <Text variant="label">API endpoint</Text>
          <Text variant="mono" style={{ fontSize: 12 }}>
            {getApiBase()}
          </Text>
          <Text muted>
            Physical phones need your PC LAN IP. Emulator uses 10.0.2.2. Web
            uses localhost.
          </Text>
        </Card>

        <Card variant="soft" style={{ gap: spacing.md }}>
          <Text variant="label">Categories</Text>
          <View style={styles.catGrid}>
            {categories.map((c) => (
              <View
                key={c.id}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: colors.bgCard,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: c.color }]} />
                <Text style={{ fontSize: 13 }}>{c.name}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Button title="Lock now" variant="secondary" onPress={lock} />
        <Button
          title="Sign out"
          variant="danger"
          onPress={() => {
            logout();
            router.replace("/(auth)/login");
          }}
        />

        <Text
          muted
          style={{
            textAlign: "center",
            fontFamily: typography.fontDisplay,
            fontSize: 14,
          }}
        >
          Ledger · v1.0
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
  },
});
