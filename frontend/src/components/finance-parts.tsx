import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { Chip, fmtMoney, fmtDate } from "@/src/ui";
import { categoryLabel } from "@/src/workflows";

export type Planned = {
  id: string; project_id: string; project_name?: string; amount: number; due_date: string; note: string; status: string;
};

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// Gelecek (beklenen) ödemeler listesi
export function UpcomingPayments({ planned, onChanged, showProject = true }: { planned: Planned[]; onChanged: () => void; showProject?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pending = planned.filter((p) => p.status === "bekliyor");
  const total = pending.reduce((s, p) => s + p.amount, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const pay = async (id: string) => {
    setBusy(id); setErr(null);
    try { await api(`/planned-payments/${id}/pay`, { method: "POST" }); onChanged(); }
    catch (e: any) { setErr(e?.message || "İşlem başarısız"); }
    finally { setBusy(null); }
  };

  return (
    <View style={styles.card} testID="upcoming-payments">
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Gelecek Ödemeler</Text>
        <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{fmtMoney(total)}</Text>
      </View>
      {pending.length === 0 && <Text style={styles.muted}>Bekleyen ödeme yok.</Text>}
      {pending.map((p) => {
        const overdue = new Date(p.due_date) < today;
        return (
          <View key={p.id} style={styles.row} testID={`planned-${p.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.amount}>{fmtMoney(p.amount)}</Text>
              {showProject && !!p.project_name && <Text style={styles.sub} numberOfLines={1}>{p.project_name}</Text>}
              <Text style={[styles.sub, overdue && { color: colors.error, fontWeight: "700" }]}>
                {overdue ? "Gecikmiş • " : "Vade: "}{fmtDate(p.due_date)}{p.note ? ` • ${p.note}` : ""}
              </Text>
            </View>
            <Pressable testID={`pay-planned-${p.id}`} onPress={() => pay(p.id)} disabled={busy === p.id} style={styles.payBtn}>
              {busy === p.id ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : (
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 }}>Tahsil Edildi</Text>
              )}
            </Pressable>
          </View>
        );
      })}
      {!!err && <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text>}
    </View>
  );
}

type Report = {
  year: number; months: { month: number; income: number; expense: number }[];
  year_income: number; year_expense: number; years: { year: number; income: number; expense: number }[];
};

// Aylık ve yıllık gelir-gider takibi
export function IncomeExpense({ refreshKey }: { refreshKey: number }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<"aylik" | "yillik">("aylik");
  const [data, setData] = useState<Report | null>(null);

  useEffect(() => {
    api<Report>(`/finance/report?year=${year}`).then(setData).catch(() => setData(null));
  }, [year, refreshKey]);

  const max = data ? Math.max(1, ...data.months.map((m) => Math.max(m.income, m.expense))) : 1;
  const net = data ? data.year_income - data.year_expense : 0;

  return (
    <View style={styles.card} testID="income-expense">
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Gelir - Gider</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Chip label="Aylık" active={mode === "aylik"} onPress={() => setMode("aylik")} testID="ie-mode-aylik" />
          <Chip label="Yıllık" active={mode === "yillik"} onPress={() => setMode("yillik")} testID="ie-mode-yillik" />
        </View>
      </View>

      {mode === "aylik" ? (
        <>
          <View style={styles.yearRow}>
            <Pressable testID="ie-prev-year" onPress={() => setYear(year - 1)} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
            </Pressable>
            <Text testID="ie-year" style={styles.year}>{year}</Text>
            <Pressable testID="ie-next-year" onPress={() => setYear(year + 1)} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
          <View style={styles.totals}>
            <Total label="Gelir" value={data?.year_income} color={colors.success} />
            <Total label="Gider" value={data?.year_expense} color={colors.error} />
            <Total label="Net" value={net} color={net >= 0 ? colors.brandPrimary : colors.error} />
          </View>
          <View style={styles.chart}>
            {(data?.months ?? []).map((m) => (
              <View key={m.month} style={styles.barCol}>
                <View style={styles.barPair}>
                  <View style={[styles.bar, { height: `${(m.income / max) * 100}%`, backgroundColor: colors.success }]} />
                  <View style={[styles.bar, { height: `${(m.expense / max) * 100}%`, backgroundColor: colors.error }]} />
                </View>
                <Text style={styles.barLabel}>{MONTHS[m.month - 1]}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} /><Text style={styles.sub}>Gelir</Text>
            <View style={[styles.dot, { backgroundColor: colors.error, marginLeft: spacing.md }]} /><Text style={styles.sub}>Gider</Text>
          </View>
          {(data?.months ?? []).filter((m) => m.income || m.expense).map((m) => (
            <View key={m.month} style={styles.tableRow}>
              <Text style={[styles.cell, { flex: 1.2 }]}>{MONTHS[m.month - 1]} {year}</Text>
              <Text style={[styles.cell, { color: colors.success }]}>{fmtMoney(m.income)}</Text>
              <Text style={[styles.cell, { color: colors.error }]}>{fmtMoney(m.expense)}</Text>
            </View>
          ))}
        </>
      ) : (
        <View style={{ marginTop: spacing.sm }}>
          <View style={styles.tableRow}>
            <Text style={[styles.th, { flex: 0.8 }]}>Yıl</Text>
            <Text style={styles.th}>Gelir</Text>
            <Text style={styles.th}>Gider</Text>
            <Text style={styles.th}>Net</Text>
          </View>
          {(data?.years ?? []).map((y) => (
            <View key={y.year} style={styles.tableRow} testID={`ie-year-row-${y.year}`}>
              <Text style={[styles.cell, { flex: 0.8, fontWeight: "700" }]}>{y.year}</Text>
              <Text style={[styles.cell, { color: colors.success }]}>{fmtMoney(y.income)}</Text>
              <Text style={[styles.cell, { color: colors.error }]}>{fmtMoney(y.expense)}</Text>
              <Text style={[styles.cell, { fontWeight: "700" }]}>{fmtMoney(y.income - y.expense)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Total({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{fmtMoney(value)}</Text>
    </View>
  );
}

// Proje bazında bakiyeler (sadece sahip)
export function ProjectBalances({ projects, onOpen }: { projects: any[]; onOpen: (id: string) => void }) {
  if (projects.length === 0) return <Text style={styles.muted}>Henüz iş yok.</Text>;
  return (
    <View style={{ gap: spacing.md }}>
      {projects.map((p) => {
        const pct = p.payment_completed ? 1 : p.agreed_amount > 0 ? Math.min(1, (p.received_amount || 0) / p.agreed_amount) : 0;
        return (
          <Pressable key={p.id} testID={`balance-${p.id}`} onPress={() => onOpen(p.id)} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.sub}>{categoryLabel(p.category)}{p.client_name ? ` • ${p.client_name}` : ""}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
            {p.payment_completed ? (
              <View style={styles.doneBadge}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={{ color: colors.success, fontWeight: "700", fontSize: 13 }}>Ödeme tamamlandı</Text>
              </View>
            ) : (
              <View style={[styles.totals, { marginTop: spacing.md }]}>
                <Total label="Anlaşılan" value={p.agreed_amount} color={colors.onSurface} />
                <Total label="Alınan" value={p.received_amount} color={colors.success} />
                <Total label="Kalan" value={p.remaining_amount} color={(p.remaining_amount || 0) > 0 ? colors.warning : colors.success} />
              </View>
            )}
            <View style={styles.track}><View style={[styles.fill, { width: `${pct * 100}%` }]} /></View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, marginTop: spacing.xs },
  amount: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  muted: { color: colors.muted, fontSize: 13, marginTop: spacing.sm },
  payBtn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", minWidth: 110 },
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  year: { fontSize: 17, fontWeight: "700", color: colors.onSurface, minWidth: 60, textAlign: "center" },
  totals: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
  totalLabel: { fontSize: 11, color: colors.muted, fontWeight: "700" },
  totalValue: { fontSize: 15, fontWeight: "700", marginTop: 2 },
  chart: { flexDirection: "row", height: 120, alignItems: "flex-end", marginTop: spacing.sm },
  barCol: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" },
  barPair: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 1 },
  bar: { width: 7, borderRadius: 2, minHeight: 2 },
  barLabel: { fontSize: 9, color: colors.muted, marginTop: 4 },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tableRow: { flexDirection: "row", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, gap: spacing.xs },
  th: { flex: 1, fontSize: 11, color: colors.muted, fontWeight: "700" },
  cell: { flex: 1, fontSize: 13, color: colors.onSurface },
  pName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  doneBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  track: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.brandPrimary },
});
