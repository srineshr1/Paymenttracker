import type { Expense } from "@paymenttracker/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { ExpenseRow } from "@/src/components/ExpenseRow";
import { EmptyState, Input, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing } from "@/src/design/tokens";

export default function ExpensesListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async (query?: string) => {
    setError(null);
    try {
      const res = await api.listExpenses({
        limit: 100,
        q: query?.trim() || undefined,
      });
      setItems(res.expenses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const ready = requestAnimationFrame(() => {
        void load(q);
      });
      return () => cancelAnimationFrame(ready);
    }, [load, q]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load(q);
  };

  const debouncedSearch = useMemo(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    return (text: string) => {
      setQ(text);
      if (t) clearTimeout(t);
      t = setTimeout(() => void load(text), 280);
    };
  }, [load]);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Activity" subtitle="Search & browse on this device" />

      <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
        <Input
          value={q}
          onChangeText={debouncedSearch}
          placeholder="Search merchant…"
          autoCorrect={false}
          style={{
            backgroundColor: colors.bgMuted,
            borderWidth: 0,
            minHeight: 48,
          }}
        />
        {error ? (
          <Text color={colors.danger} style={{ marginTop: spacing.sm }}>
            {error}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 100,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.border,
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={q.trim() ? "No matches" : "Nothing here yet"}
              body={
                q.trim()
                  ? "Try a different search."
                  : "Imported and manual expenses will show up in this timeline."
              }
            />
          }
          renderItem={({ item }) => (
            <ExpenseRow
              expense={item}
              onPress={() => router.push(`/(app)/expenses/${item.id}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}
