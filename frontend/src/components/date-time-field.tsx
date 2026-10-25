import { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/src/theme";
import { Button, Chip } from "@/src/ui";

const WD = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);
const MINS = [0, 15, 30, 45];

export function formatDateTime(d: Date, withTime: boolean) {
  const date = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  if (!withTime) return date;
  return `${date} • ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function DateTimeField({
  label, value, onChange, withTime = false, testID,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  withTime?: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [cursor, setCursor] = useState(new Date(value.getFullYear(), value.getMonth(), 1));

  useEffect(() => {
    if (open) {
      setDraft(value);
      setCursor(new Date(value.getFullYear(), value.getMonth(), 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const today = new Date();
  const update = (fn: (d: Date) => void) => {
    const d = new Date(draft);
    fn(d);
    setDraft(d);
  };

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable testID={testID} onPress={() => setOpen(true)} style={styles.field}>
        <Ionicons name="calendar-outline" size={18} color={colors.brandPrimary} />
        <Text style={styles.fieldText}>{formatDateTime(value, withTime)}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.monthRow}>
            <Pressable testID="dtp-prev-month" onPress={() => setCursor(new Date(y, m - 1, 1))} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.monthText}>{MONTHS[m]} {y}</Text>
            <Pressable testID="dtp-next-month" onPress={() => setCursor(new Date(y, m + 1, 1))} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {WD.map((w) => (
              <View key={w} style={styles.cell}><Text style={styles.wd}>{w}</Text></View>
            ))}
            {cells.map((day, i) => {
              if (!day) return <View key={`e${i}`} style={styles.cell} />;
              const selected = draft.getFullYear() === y && draft.getMonth() === m && draft.getDate() === day;
              const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === day;
              return (
                <Pressable
                  key={day}
                  testID={`dtp-day-${day}`}
                  onPress={() => update((d) => d.setFullYear(y, m, day))}
                  style={styles.cell}
                >
                  <View style={[styles.dayCircle, selected && { backgroundColor: colors.brandPrimary }, !selected && isToday && { borderWidth: 1, borderColor: colors.brandPrimary }]}>
                    <Text style={[styles.dayText, selected && { color: colors.onBrandPrimary, fontWeight: "700" }]}>{day}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {withTime && (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={styles.label}>Saat</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {HOURS.map((h) => (
                  <Chip key={h} testID={`dtp-hour-${h}`} label={String(h).padStart(2, "0")} active={draft.getHours() === h} onPress={() => update((d) => d.setHours(h))} />
                ))}
              </ScrollView>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {MINS.map((mm) => (
                  <Chip key={mm} testID={`dtp-min-${mm}`} label={`:${String(mm).padStart(2, "0")}`} active={draft.getMinutes() === mm} onPress={() => update((d) => d.setMinutes(mm, 0, 0))} />
                ))}
              </View>
            </View>
          )}

          <View style={{ height: spacing.lg }} />
          <Button testID="dtp-confirm" label={`Seç: ${formatDateTime(draft, withTime)}`} onPress={() => { onChange(draft); setOpen(false); }} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs },
  field: {
    minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary,
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
  },
  fieldText: { flex: 1, fontSize: 15, color: colors.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
  },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  monthText: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" },
  wd: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 15, color: colors.onSurface },
});
