import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Linking, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { whatsappNumber } from "@/src/report";
import type { Schedule } from "@/src/components/schedule-modal";

type Member = { id: string; name: string; role: string; phone?: string };

const hhmm = (d: string) => new Date(d).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

export function buildReminder(name: string, day: Date, items: Schedule[], projects: { id: string; name: string }[]) {
  const dayText = day.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  const lines = items.map((it, i) => {
    const proj = projects.find((p) => p.id === it.project_id);
    const kind = it.kind === "gorev" ? "İş" : "Arazi";
    let line = `${i + 1}) ${hhmm(it.date)} [${kind}] ${it.title}`;
    if (proj) line += ` – ${proj.name}`;
    if (it.location) line += `\n   Konum: ${it.location}`;
    if (it.note) line += `\n   Not: ${it.note}`;
    return line;
  });
  return `Merhaba ${name.split(" ")[0]}, ${dayText} günü yapılacak işlerin:\n\n${lines.join("\n")}\n\nKolay gelsin.`;
}

// Sahip: seçili günün işlerini çalışanlara WhatsApp ile hatırlatır.
export function RemindSheet({
  visible, onClose, day, items, projects,
}: {
  visible: boolean;
  onClose: () => void;
  day: Date;
  items: Schedule[];
  projects: { id: string; name: string }[];
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErr(null);
    api<Member[]>("/users").then((u) => setMembers(u.filter((m) => m.role === "employee"))).catch((e) => setErr(e?.message || "Çalışanlar yüklenemedi"));
  }, [visible]);

  const active = items.filter((i) => i.status !== "iptal");
  const rows = members
    .map((m) => ({ m, tasks: active.filter((i) => i.assigned_user_ids?.includes(m.id)) }))
    .filter((r) => r.tasks.length > 0);
  const unassigned = active.filter((i) => !i.assigned_user_ids?.length).length;

  const send = (m: Member, tasks: Schedule[]) => {
    const msg = buildReminder(m.name, day, tasks, projects);
    Linking.openURL(`https://wa.me/${whatsappNumber(m.phone || "")}?text=${encodeURIComponent(msg)}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="remind-sheet">
        <Text style={styles.title}>Çalışanlara Hatırlat</Text>
        <Text style={styles.sub}>{day.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</Text>
        <ScrollView style={{ maxHeight: 360 }}>
          {rows.length === 0 && (
            <Text style={styles.muted}>Bu gün için çalışana atanmış iş yok. Takvim kaydını açıp "Görevli Çalışanlar"dan seçebilirsiniz.</Text>
          )}
          {rows.map(({ m, tasks }) => (
            <View key={m.id} style={styles.row}>
              <View style={styles.avatar}><Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>{m.name[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.muted}>{tasks.length} iş{m.phone ? "" : " • telefon yok"}</Text>
              </View>
              {m.phone ? (
                <Pressable testID={`remind-${m.id}`} onPress={() => send(m, tasks)} style={styles.waBtn}>
                  <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>Gönder</Text>
                </Pressable>
              ) : (
                <Pressable testID={`remind-add-phone-${m.id}`} onPress={() => { onClose(); router.push("/(tabs)/settings"); }} style={styles.phoneBtn}>
                  <Text style={{ color: colors.onBrandTertiary, fontWeight: "700", fontSize: 13 }}>Telefon Ekle</Text>
                </Pressable>
              )}
            </View>
          ))}
          {unassigned > 0 && <Text style={[styles.muted, { marginTop: spacing.sm }]}>{unassigned} kayıtta görevli çalışan seçilmemiş.</Text>}
          {!!err && <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text>}
        </ScrollView>
        <Pressable testID="remind-close" onPress={onClose} style={styles.close}>
          <Text style={{ color: colors.muted, fontWeight: "600" }}>Kapat</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  title: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginBottom: spacing.md, marginTop: 2 },
  muted: { fontSize: 13, color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  // WhatsApp brand green stays identical across themes
  waBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: "#25D366" },
  phoneBtn: { height: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  close: { height: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
});
