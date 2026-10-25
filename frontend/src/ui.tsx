import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { colors, spacing, radius } from "@/src/theme";

export function Button({
  label, onPress, variant = "primary", loading, disabled, testID,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const palette = {
    primary: { bg: colors.brandPrimary, fg: colors.onBrandPrimary },
    secondary: { bg: colors.brandTertiary, fg: colors.onBrandTertiary },
    danger: { bg: colors.error, fg: colors.onError },
    ghost: { bg: "transparent", fg: colors.brandPrimary },
  }[variant];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: palette.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.btnText, { color: palette.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: any) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary,
          borderColor: active ? colors.brandPrimary : colors.border },
      ]}
    >
      <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurface, fontSize: 13, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "onaylandi" || status === "tamamlandi" || status === "bitti"
      ? colors.success
      : status === "reddedildi" || status === "iptal"
      ? colors.error
      : colors.warning;
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
}

export function SegmentedControl({
  items, value, onChange, testIDPrefix,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.segWrap}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            testID={`${testIDPrefix}-${it.key}`}
            onPress={() => onChange(it.key)}
            style={[styles.segItem, active && { backgroundColor: colors.surfaceSecondary, ...styles.segShadow }]}
          >
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: active ? colors.brandPrimary : colors.onSurfaceTertiary }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  segWrap: {
    flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
    padding: 3, marginHorizontal: spacing.lg, height: 44,
  },
  segItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.md - 2, paddingHorizontal: 4 },
  segShadow: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
  },
  btn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
  },
  btnText: { fontSize: 16, fontWeight: "600" },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});

export const LABELS: Record<string, string> = {
  hepsi: "Hepsi", aktif: "Aktif", bitti: "Bitti", iptal: "İptal",
  genel: "Genel", arazi: "Arazi", ulasim: "Ulaşım", kurum_harc: "Kurum Harcı", malzeme: "Malzeme",
  tapu: "Tapu", imar: "İmar", kroki: "Kroki", foto: "Fotoğraf", diger: "Diğer",
  finans: "Finans", evraklar: "Evraklar", kurum: "Kurum", surec: "Süreç",
  beklemede: "Beklemede", onaylandi: "Onaylandı", reddedildi: "Reddedildi",
  planlandi: "Planlandı", tamamlandi: "Tamamlandı",
};
export const label = (k: string) => LABELS[k] ?? k;

export function fmtMoney(n?: number | null) {
  const v = Number(n || 0);
  return v.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
}

export function fmtDate(d?: string | Date | null) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}
