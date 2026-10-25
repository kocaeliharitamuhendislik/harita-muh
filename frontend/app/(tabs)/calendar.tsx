import { useState, useCallback, useEffect } from "react";
import { DateTimeField } from "@/src/components/date-time-field";
import { AssigneeChips, useTeam } from "@/src/components/team";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Field } from "./projects";
import { Chip, fmtDate } from "@/src/ui";

type Schedule = {
  id: string;
  project_id?: string;
  title: string;
  date: string;
  duration_hours: number;
  location: string;
  note: string;
  status: string;
  assigned_user_ids: string[];
};

type Project = { id: string; name: string };

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function startOfDay(d: Date) { const n = new Date(d); n.setHours(0,0,0,0); return n; }
function sameDay(a: Date, b: Date) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<Schedule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
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

  const todays = items.filter((it) => sameDay(new Date(it.date), selected))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
        <Text style={styles.title}>Arazi Takvimi</Text>
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

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {todays.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>Bu güne atanmış program yok.</Text>
          </View>
        ) : (
          todays.map((it) => {
            const proj = projects.find((p) => p.id === it.project_id);
            const done = it.status === "tamamlandi";
            return (
              <Pressable
                key={it.id}
                testID={`schedule-${it.id}`}
                onPress={() => toggleStatus(it.id, it.status)}
                style={[styles.item, done && { opacity: 0.6 }]}
              >
                <View style={styles.timeCol}>
                  <Text style={styles.time}>{new Date(it.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</Text>
                  <Text style={styles.dur}>{it.duration_hours}sa</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, done && { textDecorationLine: "line-through" }]}>{it.title}</Text>
                  {!!proj && <Text style={styles.itemSub}>{proj.name}</Text>}
                  {!!it.location && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Ionicons name="location-outline" size={12} color={colors.muted} />
                      <Text style={styles.itemMeta}>{it.location}</Text>
                    </View>
                  )}
                </View>
                <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={28} color={done ? colors.success : colors.border} />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Pressable
        testID="add-schedule-fab"
        onPress={() => setShowCreate(true)}
        style={[styles.fab, { bottom: spacing.lg }]}
      >
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>

      <CreateScheduleModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(d?: Date) => { load(); if (d) jumpTo(d); }}
        projects={projects}
        defaultDate={selected}
      />
    </View>
  );
}

function CreateScheduleModal({ visible, onClose, onCreated, projects, defaultDate }: any) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const team = useTeam();
  const at9 = (d: Date) => { const n = new Date(d); n.setHours(9, 0, 0, 0); return n; };
  const [when, setWhen] = useState<Date>(at9(defaultDate));
  const [assignees, setAssignees] = useState<string[]>([]);

  useEffect(() => {
    if (visible) { setWhen(at9(defaultDate)); setAssignees([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const [duration, setDuration] = useState("2");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { setErr("Başlık gerekli"); return; }
    setSaving(true);
    try {
      const iso = when.toISOString();
      await api("/schedules", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId, title: title.trim(), date: iso,
          duration_hours: parseFloat(duration) || 1, location: location.trim(), note: note.trim(),
          assigned_user_ids: assignees,
        }),
      });
      onClose();
      onCreated(when);
      setTitle(""); setLocation(""); setNote(""); setErr(null);
    } catch (e: any) { setErr(e?.message || "Hata"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={onClose}><Text style={{ color: colors.muted }}>İptal</Text></Pressable>
          <Text style={styles.modalTitle}>Yeni Program</Text>
          <Pressable onPress={save} disabled={saving} testID="save-schedule"><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{saving ? "..." : "Kaydet"}</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field label="Başlık *" value={title} onChangeText={setTitle} placeholder="Örn: Arazi ölçüm" testID="sch-title" />
          <View>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs }}>Proje</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
              <Chip label="Yok" active={!projectId} onPress={() => setProjectId(null)} />
              {projects.map((p: any) => (
                <Chip key={p.id} label={p.name} active={projectId === p.id} onPress={() => setProjectId(p.id)} />
              ))}
            </ScrollView>
          </View>
          <DateTimeField label="Tarih ve Saat" value={when} onChange={setWhen} withTime testID="sch-datetime" />
          {isOwner && (
            <View>
              <AssigneeChips team={team} selected={assignees} onChange={setAssignees} testIDPrefix="sch-assignee" />
              {projectId && assignees.length === 0 && (
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: spacing.xs }}>Seçilmezse projenin ekibi atanır.</Text>
              )}
            </View>
          )}
          <Field label="Süre (saat)" value={duration} onChangeText={setDuration} keyboardType="numeric" />
          <Field label="Lokasyon" value={location} onChangeText={setLocation} placeholder="Adres / parsel" />
          <Field label="Not" value={note} onChangeText={setNote} multiline />
          {err && <Text style={{ color: colors.error }}>{err}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4, textTransform: "capitalize" },
  navRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  todayBtn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center", height: 92 },
  dayBox: {
    width: 60, height: 76, borderRadius: radius.md, borderWidth: 1,
    alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0,
  },
  dayWd: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
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
