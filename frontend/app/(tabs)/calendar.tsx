import { useState, useCallback } from "react";
import { ScheduleModal, KIND_OPTS } from "@/src/components/schedule-modal";
import { RemindSheet } from "@/src/components/remind-sheet";
import { useAuth } from "@/src/auth-context";
import { Chip } from "@/src/ui";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type Schedule = {
  id: string;
  project_id?: string;
  title: string;
  date: string;
  duration_hours: number;
  location: string;
  note: string;
  status: string;
  kind?: "arazi" | "gorev";
  assigned_user_ids: string[];
};

type Project = { id: string; name: string };

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function startOfDay(d: Date) { const n = new Date(d); n.setHours(0,0,0,0); return n; }
function sameDay(a: Date, b: Date) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Schedule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [kindFilter, setKindFilter] = useState<string>("hepsi");
  const [remindOpen, setRemindOpen] = useState(false);
  const [selected, setSelected] = useState<Date>(startOfDay(new Date()));
  const [stripStart, setStripStart] = useState<Date>(startOfDay(new Date()));
  const shiftStrip = (n: number) => {
    const s = new Date(stripStart); s.setDate(s.getDate() + n);
    setStripStart(s); setSelected(s);
  };
  const jumpTo = (d: Date) => { const s = startOfDay(d); setStripStart(s); setSelected(s); };

  const load = useCallback(async () => {
    try {
      const [sch, pr] = await Promise.all([api<Schedule[]>("/schedules"), api<Project[]>("/projects")]);
      setItems(sch);
      setProjects(pr);
    } catch {} finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 14-day strip from today
  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(stripStart); d.setDate(d.getDate() + i); return startOfDay(d);
  });

  const dayItems = items.filter((it) => sameDay(new Date(it.date), selected))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const todays = dayItems.filter((it) => kindFilter === "hepsi" || (it.kind || "arazi") === kindFilter);

  const toggleStatus = async (id: string, status: string) => {
    const next = status === "tamamlandi" ? "planlandi" : "tamamlandi";
    const form = new FormData(); form.append("status", next);
    await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/schedules/${id}/status`, {
      method: "POST", body: form as any,
      headers: { Authorization: `Bearer ${await (await import("@/src/api")).getToken()}` },
    });
    load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Takvim</Text>
          {isOwner && (
            <Pressable testID="remind-btn" onPress={() => setRemindOpen(true)} style={styles.remindBtn}>
              <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>Hatırlat</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.navRow}>
          <Text style={[styles.sub, { flex: 1 }]}>{selected.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Text>
          <Pressable testID="strip-prev" onPress={() => shiftStrip(-7)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable testID="strip-today" onPress={() => jumpTo(new Date())} style={styles.todayBtn}>
            <Text style={{ color: colors.onBrandTertiary, fontWeight: "700", fontSize: 13 }}>Bugün</Text>
          </Pressable>
          <Pressable testID="strip-next" onPress={() => shiftStrip(7)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={{ maxHeight: 92 }}>
        {days.map((d) => {
          const active = sameDay(d, selected);
          const count = items.filter((it) => sameDay(new Date(it.date), d)).length;
          return (
            <Pressable key={d.toISOString()} onPress={() => setSelected(d)} testID={`day-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`}
              style={[styles.dayBox, { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimary : colors.border }]}>
              <Text style={[styles.dayWd, { color: active ? colors.onBrandPrimary : colors.muted }]}>{WEEKDAYS[(d.getDay() + 6) % 7]}</Text>
              <Text style={[styles.dayNum, { color: active ? colors.onBrandPrimary : colors.onSurface }]}>{d.getDate()}</Text>
              <Text style={[styles.dayMo, { color: active ? colors.onBrandPrimary : colors.muted }]}>{MONTHS[d.getMonth()]}</Text>
              {count > 0 && <View style={[styles.dot, { backgroundColor: active ? colors.onBrandPrimary : colors.brandPrimary }]} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kindRow} style={{ maxHeight: 56, flexGrow: 0 }}>
        <Chip label={`Tümü (${dayItems.length})`} active={kindFilter === "hepsi"} onPress={() => setKindFilter("hepsi")} testID="kind-filter-hepsi" />
        {KIND_OPTS.map((k) => (
          <Chip
            key={k.key}
            label={`${k.label} (${dayItems.filter((i) => (i.kind || "arazi") === k.key).length})`}
            active={kindFilter === k.key}
            onPress={() => setKindFilter(k.key)}
            testID={`kind-filter-${k.key}`}
          />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {todays.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>Bu gün için kayıt yok.</Text>
          </View>
        ) : (
          todays.map((it) => {
            const proj = projects.find((p) => p.id === it.project_id);
            const done = it.status === "tamamlandi";
            return (
              <Pressable
                key={it.id}
                testID={`schedule-${it.id}`}
                onPress={() => { setEditing(it); setShowCreate(true); }}
                style={[styles.item, done && { opacity: 0.6 }]}
              >
                <View style={styles.timeCol}>
                  <Text style={styles.time}>{new Date(it.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</Text>
                  <Text style={styles.dur}>{it.duration_hours}sa</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, done && { textDecorationLine: "line-through" }]}>{it.title}</Text>
                  <View style={styles.kindTag}>
                    <Ionicons name={it.kind === "gorev" ? "checkbox-outline" : "map-outline"} size={12} color={colors.brandPrimary} />
                    <Text style={styles.kindText}>{it.kind === "gorev" ? "Günün İşi" : "Arazi"}</Text>
                  </View>
                  {!!proj && <Text style={styles.itemSub}>{proj.name}</Text>}
                  {!!it.location && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Ionicons name="location-outline" size={12} color={colors.muted} />
                      <Text style={styles.itemMeta}>{it.location}</Text>
                    </View>
                  )}
                </View>
                <Pressable testID={`toggle-schedule-${it.id}`} onPress={() => toggleStatus(it.id, it.status)} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={28} color={done ? colors.success : colors.borderStrong} />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Pressable
        testID="add-schedule-fab"
        onPress={() => { setEditing(null); setShowCreate(true); }}
        style={[styles.fab, { bottom: spacing.lg }]}
      >
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>

      <ScheduleModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={(d?: Date) => { load(); if (d) jumpTo(d); }}
        projects={projects}
        defaultDate={selected}
        schedule={editing}
      />
      <RemindSheet visible={remindOpen} onClose={() => setRemindOpen(false)} day={selected} items={dayItems} projects={projects} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4, textTransform: "capitalize" },
  navRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  // WhatsApp brand green stays identical across themes
  remindBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: "#25D366" },
  kindRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center", height: 56 },
  kindTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  kindText: { fontSize: 11, color: colors.brandPrimary, fontWeight: "700" },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  todayBtn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center", height: 92 },
  dayBox: {
    width: 60, height: 76, borderRadius: radius.md, borderWidth: 1,
    alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0,
  },
  dayWd: { fontSize: 11, fontWeight: "600" },
  dayNum: { fontSize: 20, fontWeight: "700" },
  dayMo: { fontSize: 10 },
  dot: { width: 4, height: 4, borderRadius: 2, position: "absolute", bottom: 6 },
  empty: { alignItems: "center", padding: spacing["3xl"], gap: spacing.md },
  emptyText: { color: colors.muted, fontSize: 15 },
  item: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  timeCol: { width: 56, alignItems: "center" },
  time: { fontSize: 16, fontWeight: "700", color: colors.brandPrimary },
  dur: { fontSize: 11, color: colors.muted },
  itemTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  itemSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  itemMeta: { fontSize: 12, color: colors.muted },
  fab: {
    position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
});
