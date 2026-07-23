import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "@/src/components/AppHeader";
import { Button, Card, Screen, Text } from "@/src/components/ui";
import { useTheme } from "@/src/design/ThemeContext";
import { radius, spacing, typography } from "@/src/design/tokens";
import {
  type ClassifiedSmsRow,
  type ClassifySmsStats,
  forceImportClassifiedRows,
  importAndSavePaymentsFromSms,
  scanSmsInboxForImport,
  smsReasonLabel,
} from "@/src/features/sms/importSms";
import { isSmsInboxAvailable } from "@/src/features/sms/readInbox";
import { syncAccountBalanceFromInbox } from "@/src/features/sms/syncBalance";

const NATIVE_HINT =
  "SMS import needs the Spentd APK (not Expo Go). Install from GitHub Releases or run: npx expo run:android";

type FilterTab = "skipped" | "ready" | "all_payment";

function formatWhen(dateMs?: number | null, paidAt?: string | null): string {
  const t =
    dateMs && Number.isFinite(dateMs)
      ? dateMs
      : paidAt
        ? Date.parse(paidAt)
        : Number.NaN;
  if (!Number.isFinite(t)) return "Unknown time";
  try {
    return new Date(t).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown time";
  }
}

function formatMoney(amount: string | null | undefined): string {
  if (!amount) return "—";
  const n = Number(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(n)) return `₹${amount}`;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.statChip,
        {
          backgroundColor: colors.bgMuted,
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: typography.fontDisplayBold,
          fontSize: 22,
          color: accent ?? colors.text,
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
      <Text muted style={{ fontSize: 11, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

function ReasonBadge({ reason, label }: { reason: string; label: string }) {
  const { colors } = useTheme();
  const tone =
    reason === "importable"
      ? colors.success
      : reason === "duplicate" || reason === "already_saved"
        ? colors.textMuted
        : reason === "pending_tx" || reason === "low_confidence"
          ? colors.warning
          : colors.debit;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: `${tone}22`, borderColor: `${tone}44` },
      ]}
    >
      <Text
        style={{
          color: tone,
          fontSize: 11,
          fontFamily: typography.fontSansSemi,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function SmsImportScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ClassifySmsStats | null>(null);
  const [skipped, setSkipped] = useState<ClassifiedSmsRow[]>([]);
  const [ready, setReady] = useState<ClassifiedSmsRow[]>([]);
  const [allPayment, setAllPayment] = useState<ClassifiedSmsRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<FilterTab>("skipped");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<string | null>(null);

  const list =
    tab === "skipped" ? skipped : tab === "ready" ? ready : allPayment;

  const runScan = useCallback(async () => {
    if (Platform.OS !== "android") {
      setError("SMS import is only available on Android.");
      return;
    }
    if (!isSmsInboxAvailable()) {
      setError(NATIVE_HINT);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Scanning inbox…");
    setLastImport(null);
    try {
      const result = await scanSmsInboxForImport({
        lookbackDays: 90,
        maxCount: 2000,
      });
      setStats(result.stats);
      setSkipped(result.skippedPaymentLike);
      setReady(result.importable);
      setAllPayment(result.rows.filter((r) => r.reason !== "not_payment"));
      setSelected(new Set());
      setStatus(null);
      // Prefer balance sync so the number matches UPI apps
      try {
        await syncAccountBalanceFromInbox();
      } catch {
        /* best-effort */
      }
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Could not scan SMS inbox.");
    } finally {
      setBusy(false);
    }
  }, []);

  const runImportReady = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setLastImport(null);
    try {
      const res = await importAndSavePaymentsFromSms(
        { lookbackDays: 90, maxCount: 2000 },
        (msg) => setStatus(msg),
      );
      setLastImport(
        `Imported ${res.created} · skipped ${res.skipped} (already saved / dups) · failed ${res.failed}`,
      );
      await runScan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setStatus(null);
      setBusy(false);
    }
  };

  const runImportSelected = async () => {
    if (busy || selected.size === 0) return;
    const rows = allPayment.filter((r) => selected.has(r.id));
    if (!rows.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await forceImportClassifiedRows(rows, (msg) =>
        setStatus(msg),
      );
      setLastImport(
        `Forced ${res.created} saved · ${res.skipped} skipped · ${res.failed} failed`,
      );
      setSelected(new Set());
      await runScan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save selected.");
      setStatus(null);
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(list.map((r) => r.id)));
  };

  const renderItem = ({ item }: { item: ClassifiedSmsRow }) => {
    const p = item.parsed;
    const isSel = selected.has(item.id);
    const open = expandedId === item.id;
    const merchant =
      p?.merchant?.trim() ||
      (p?.direction === "credit" ? "Money received" : "Unknown merchant");
    const body = (item.message.body ?? "").trim();

    return (
      <Pressable
        onPress={() => toggle(item.id)}
        onLongPress={() =>
          setExpandedId((cur) => (cur === item.id ? null : item.id))
        }
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: isSel ? colors.accentSoft : colors.bgElevated,
            borderColor: isSel ? colors.accent : colors.border,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <View style={styles.rowTop}>
          <View
            style={[
              styles.check,
              {
                borderColor: isSel ? colors.accentStrong : colors.borderStrong,
                backgroundColor: isSel ? colors.accent : "transparent",
              },
            ]}
          >
            {isSel ? (
              <Ionicons name="checkmark" size={14} color={colors.accentOn} />
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.rowTitleLine}>
              <Text
                style={{
                  flex: 1,
                  fontFamily: typography.fontSansSemi,
                  fontSize: 15,
                }}
                numberOfLines={1}
              >
                {merchant}
              </Text>
              <Text
                style={{
                  fontFamily: typography.fontMono,
                  fontSize: 14,
                  color:
                    p?.direction === "credit" ? colors.credit : colors.debit,
                }}
              >
                {p?.direction === "credit" ? "+" : "−"}
                {formatMoney(p?.amount)}
              </Text>
            </View>
            <View style={styles.metaLine}>
              <ReasonBadge reason={item.reason} label={item.reasonLabel} />
              <Text muted style={{ fontSize: 11 }}>
                {formatWhen(item.message.dateMs, p?.paidAt)}
              </Text>
              {item.message.address ? (
                <Text muted style={{ fontSize: 11 }} numberOfLines={1}>
                  {item.message.address}
                </Text>
              ) : null}
            </View>
            {p?.availableBalance ? (
              <Text muted style={{ fontSize: 12 }}>
                Avl bal {formatMoney(p.availableBalance)}
                {p.upiRef ? ` · ref ${p.upiRef.slice(0, 12)}` : ""}
              </Text>
            ) : p?.upiRef ? (
              <Text muted style={{ fontSize: 12 }}>
                Ref {p.upiRef}
              </Text>
            ) : null}
          </View>
        </View>
        {open ? (
          <Text
            muted
            style={{
              marginTop: spacing.sm,
              fontSize: 12,
              lineHeight: 17,
              fontFamily: typography.fontMono,
            }}
            selectable
          >
            {body}
          </Text>
        ) : (
          <Text
            muted
            numberOfLines={2}
            style={{ marginTop: 6, fontSize: 12, lineHeight: 16 }}
          >
            {body}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <AppHeader
        title="SMS import"
        subtitle="On-device · last 90 days"
        backTo="/(app)/import"
      />

      <FlatList
        data={stats ? list : []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 120,
          gap: spacing.sm,
        }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Card variant="soft" style={{ gap: spacing.md }}>
              <Text variant="label">Scan bank & UPI messages</Text>
              <Text muted style={{ fontSize: 13, lineHeight: 19 }}>
                Reads your Android inbox on this phone. Payment-like SMS are
                parsed; anything not imported shows below with a reason and
                count.
              </Text>
              <Button
                title={busy ? "Working…" : stats ? "Scan again" : "Scan inbox"}
                onPress={() => void runScan()}
                loading={busy && !stats}
                disabled={busy}
              />
              {stats ? (
                <Button
                  title={
                    busy
                      ? "Importing…"
                      : `Import ${stats.importable} ready payment${
                          stats.importable === 1 ? "" : "s"
                        }`
                  }
                  onPress={() => void runImportReady()}
                  disabled={busy || stats.importable === 0}
                  variant="secondary"
                />
              ) : null}
            </Card>

            {status ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color={colors.accent} />
                <Text muted style={{ flex: 1, fontSize: 13 }}>
                  {status}
                </Text>
              </View>
            ) : null}

            {error ? (
              <Text
                color={colors.warning}
                style={{ lineHeight: 20, fontSize: 14 }}
              >
                {error}
              </Text>
            ) : null}

            {lastImport ? (
              <Text
                color={colors.success}
                style={{ fontSize: 13, lineHeight: 18 }}
              >
                {lastImport}
              </Text>
            ) : null}

            {stats ? (
              <>
                <View style={styles.statGrid}>
                  <StatChip label="Scanned" value={stats.scanned} />
                  <StatChip
                    label="Payment-like"
                    value={stats.paymentLike}
                    accent={colors.accentStrong}
                  />
                  <StatChip
                    label="Ready"
                    value={stats.importable}
                    accent={colors.success}
                  />
                  <StatChip
                    label="Not imported"
                    value={stats.skipped}
                    accent={colors.warning}
                  />
                </View>

                {stats.byReason ? (
                  <Card variant="soft" style={{ gap: 6 }}>
                    <Text variant="label">Breakdown</Text>
                    {(
                      [
                        "importable",
                        "duplicate",
                        "low_confidence",
                        "junk",
                        "pending_tx",
                        "failed_tx",
                        "no_amount",
                        "not_payment",
                      ] as const
                    ).map((key) => {
                      const n = stats.byReason[key] ?? 0;
                      if (!n) return null;
                      return (
                        <View key={key} style={styles.breakRow}>
                          <Text muted style={{ flex: 1, fontSize: 13 }}>
                            {smsReasonLabel(key)}
                          </Text>
                          <Text
                            style={{
                              fontFamily: typography.fontMono,
                              fontSize: 13,
                            }}
                          >
                            {n}
                          </Text>
                        </View>
                      );
                    })}
                  </Card>
                ) : null}

                <View style={styles.tabs}>
                  {(
                    [
                      ["skipped", `Not imported (${skipped.length})`],
                      ["ready", `Ready (${ready.length})`],
                      ["all_payment", `All payment (${allPayment.length})`],
                    ] as const
                  ).map(([id, label]) => {
                    const on = tab === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => setTab(id)}
                        style={[
                          styles.tab,
                          {
                            backgroundColor: on
                              ? colors.accentSoft
                              : colors.bgMuted,
                            borderColor: on ? colors.accent : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontFamily: typography.fontSansSemi,
                            color: on
                              ? colors.accentStrong
                              : colors.textSecondary,
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {list.length > 0 ? (
                  <View style={styles.listActions}>
                    <Pressable onPress={selectAllVisible} hitSlop={8}>
                      <Text
                        style={{
                          color: colors.accentStrong,
                          fontFamily: typography.fontSansSemi,
                          fontSize: 13,
                        }}
                      >
                        Select all on this tab
                      </Text>
                    </Pressable>
                    <Text muted style={{ fontSize: 12 }}>
                      Tap to select · long-press for full text
                    </Text>
                  </View>
                ) : (
                  <Text muted style={{ fontSize: 13, textAlign: "center" }}>
                    {tab === "skipped"
                      ? "No payment-like messages left unimported."
                      : "Nothing in this list."}
                  </Text>
                )}
              </>
            ) : (
              <Text muted style={{ fontSize: 13, lineHeight: 19 }}>
                Tap Scan inbox to classify messages. Non-imported payment SMS
                appear with amounts and reasons so you can force-import any that
                look right.
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={stats ? null : <View style={{ height: 8 }} />}
      />

      {selected.size > 0 ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, spacing.md),
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Button
            title={busy ? "Saving…" : `Import selected (${selected.size})`}
            onPress={() => void runImportSelected()}
            loading={busy}
            disabled={busy}
          />
          <Pressable
            onPress={() => setSelected(new Set())}
            style={{ alignItems: "center", paddingVertical: 8 }}
          >
            <Text muted style={{ fontSize: 13 }}>
              Clear selection
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statChip: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 140,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  breakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  row: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  rowTop: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
});
