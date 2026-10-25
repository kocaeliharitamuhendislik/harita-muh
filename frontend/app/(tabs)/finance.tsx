import { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { Field } from "./projects";
import { Chip, fmtMoney, fmtDate } from "@/src/ui";

type Summary = {
  total_offer: number; total_agreed: number; total_received: number; total_remaining: number;
  total_expenses: number; net_profit: number;
  expenses_by_category: Record<string, number>;
  monthly_payments: { month: string; total: number }[];
  active_projects: number; total_projects: number;
};
type Expense = { id: string; amount: number; date: string; category: string; note: string; project_id?: string | null };

const CATEGORIES = ["genel", "arazi", "ulasim", "kurum_harc", "malzeme"];

export default function Finance() {
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api<Summary>("/finance/summary"), api<Expense[]>("/expenses")]);
      setSummary(s); setExpenses(e);
    } catch {} finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const collectionPct = summary && summary.total_agreed > 0
    ? Math.min(1, summary.total_received / summary.total_agreed) : 0;

  const maxMonthly = summary ? Math.max(1, ...summary.monthly_payments.map((m) => m.total)) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Finans</Text>
        <Text style={styles.sub}>Sadece sahip görünümü</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {summary && (
          <>
            <View style={styles.grid}>
              <Kpi label="Anlaşılan" value={fmtMoney(summary.total_agreed)} icon="document-text-outline" color={colors.brandPrimary} testID="kpi-agreed" />
              <Kpi label="Alınan" value={fmtMoney(summary.total_received)} icon="cash-outline" color={colors.success} testID="kpi-received" />
              <Kpi label="Kalan" value={fmtMoney(summary.total_remaining)} icon="hourglass-outline" color={colors.warning} testID="kpi-remaining" />
              <Kpi label="Gider" value={fmtMoney(summary.total_expenses)} icon="trending-down-outline" color={colors.error} testID="kpi-expense" />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tahsilat Oranı</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${collectionPct * 100}%` }]} />
              </View>
              <Text style={styles.cardMeta}>%{Math.round(collectionPct * 100)} • Net Kar: <Text style={{ color: summary.net_profit >= 0 ? colors.success : colors.error, fontWeight: "700" }}>{fmtMoney(summary.net_profit)}</Text></Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Son 6 Ay Tahsilat</Text>
              {summary.monthly_payments.length === 0 ? (
                <Text style={{ color: colors.muted, fontSize: 13 }}>Henüz ödeme yok.</Text>
              ) : (
                <View style={styles.chart}>
                  {summary.monthly_payments.map((m) => (
                    <View key={m.month} style={styles.bar}>
                      <View style={{ flex: 1, justifyContent: "flex-end", width: 24 }}>
                        <View style={[styles.barFill, { height: `${(m.total / maxMonthly) * 100}%` }]} />
                      </View>
                      <Text style={styles.barLabel}>{m.month.slice(5)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Giderler</Text>
                <Pressable testID="add-expense-btn" onPress={() => setShowAdd(true)} style={styles.addBtn}>
                  <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
                  <Text style={{ color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700" }}>Ekle</Text>
                </Pressable>
              </View>
              {expenses.length === 0 && <Text style={{ color: colors.muted, fontSize: 13, marginTop: spacing.sm }}>Henüz gider yok.</Text>}
              {expenses.slice(0, 10).map((e) => (
                <View key={e.id} style={styles.expRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expCat}>{e.category}</Text>
                    {!!e.note && <Text style={styles.expNote}>{e.note}</Text>}
                    <Text style={styles.expDate}>{fmtDate(e.date)}</Text>
                  </View>
                  <Text style={styles.expAmt}>{fmtMoney(e.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <AddExpenseModal visible={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
    </View>
  );
}

function Kpi({ label, value, icon, color, testID }: any) {
  return (
    <View style={styles.kpi} testID={testID}>
      <View style={[styles.kpiIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function AddExpenseModal({ visible, onClose, onCreated }: any) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("genel");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt) return;
    setSaving(true);
    try {
      await api("/expenses", { method: "POST", body: JSON.stringify({ amount: amt, note, category, date: new Date(date + "T00:00:00").toISOString() }) });
      setAmount(""); setNote("");
      onClose(); onCreated();
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={onClose}><Text style={{ color: colors.muted }}>İptal</Text></Pressable>
          <Text style={styles.modalTitle}>Yeni Gider</Text>
          <Pressable onPress={save} disabled={saving} testID="save-expense"><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Kaydet</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field label="Tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="numeric" testID="exp-amount" />
          <View>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs }}>Kategori</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
              ))}
            </ScrollView>
          </View>
          <Field label="Tarih (YYYY-MM-DD)" value={date} onChangeText={setDate} />
          <Field label="Açıklama" value={note} onChangeText={setNote} multiline />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: {
    width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  kpiLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  kpiValue: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.md },
  cardMeta: { fontSize: 13, color: colors.muted, marginTop: spacing.sm },
  progressTrack: { height: 10, backgroundColor: colors.surfaceTertiary, borderRadius: 5, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brandPrimary, borderRadius: 5 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: spacing.sm, justifyContent: "space-around" },
  bar: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 4 },
  barFill: { width: 24, backgroundColor: colors.brandPrimary, borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 10, color: colors.muted },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  expRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  expCat: { fontSize: 14, fontWeight: "600", color: colors.onSurface, textTransform: "capitalize" },
  expNote: { fontSize: 12, color: colors.muted, marginTop: 2 },
  expDate: { fontSize: 11, color: colors.muted, marginTop: 2 },
  expAmt: { fontSize: 15, fontWeight: "700", color: colors.error },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
});
