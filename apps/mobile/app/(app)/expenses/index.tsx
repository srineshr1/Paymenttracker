import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Expense } from "@paymenttracker/shared";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/AppHeader";
import { ExpenseRow } from "@/src/components/ExpenseRow";
import { EmptyState, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { spacing } from "@/src/design/tokens";

export default function ExpensesListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.listExpenses({ limit: 100 });
      setItems(res.expenses);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Defer past the stack transition so Android doesn't blank the scene.
      const ready = requestAnimationFrame(() => {
        void load();
      });
      return () => cancelAnimationFrame(ready);
    }, [load])
  );

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader title="Activity" subtitle="All expenses on this device" />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 100,
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
              title="Nothing here yet"
              body="Imported and manual expenses will show up in this timeline."
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

