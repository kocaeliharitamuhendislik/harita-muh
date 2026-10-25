import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { Chip } from "@/src/ui";
import { Field } from "@/src/ui";
import { DateTimeField } from "@/src/components/date-time-field";
import { AssigneeChips, useTeam } from "@/src/components/team";

export type Schedule = {
  id: string;
  project_id?: string | null;
  title: string;
  date: string;
  duration_hours: number;
  location: string;
  note: string;
  status: string;
  kind?: "arazi" | "gorev";
  assigned_user_ids: string[];
};

export const KIND_OPTS = [
  { key: "arazi", label: "Arazi Programı", icon: "map-outline" },
  { key: "gorev", label: "Günün İşi", icon: "checkbox-outline" },
] as const;

const STATUS_OPTS = [
  { key: "planlandi", label: "Planlandı" },
  { key: "tamamlandi", label: "Tamamlandı" },
  { key: "iptal", label: "İptal" },
];

const at9 = (d: Date) => { const n = new Date(d); n.setHours(9, 0, 0, 0); return n; };

// Arazi programı ekleme / düzenleme. Sahip ve çalışanlar kullanabilir.
export function ScheduleModal({
  visible, onClose, onSaved, projects, defaultDate, schedule, presetProjectId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (d?: Date) => void;
  projects: { id: string; name: string }[];
  defaultDate: Date;
  schedule?: Schedule | null;
  presetProjectId?: string;
}) {
  const insets = useSafeAreaInsets();
  const team = useTeam();
  const editing = !!schedule;
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [when, setWhen] = useState<Date>(at9(defaultDate));
  const [duration, setDuration] = useState("2");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("planlandi");
  const [kind, setKind] = useState<"arazi" | "gorev">("arazi");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setErr(null);
    setConfirmDelete(false);
    if (schedule) {
      setTitle(schedule.title);
      setProjectId(schedule.project_id ?? null);
      setWhen(new Date(schedule.date));
      setDuration(String(schedule.duration_hours ?? 1));
      setLocation(schedule.location || "");
      setNote(schedule.note || "");
      setStatus(schedule.status || "planlandi");
      setKind(schedule.kind || "arazi");
      setAssignees(schedule.assigned_user_ids || []);
    } else {
      setTitle(""); setLocation(""); setNote(""); setDuration("2"); setStatus("planlandi"); setKind("arazi");
      setProjectId(presetProjectId ?? null);
      setWhen(at9(defaultDate));
      setAssignees([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = async () => {
    if (!title.trim()) { setErr("Başlık gerekli"); return; }
    setSaving(true);
    setErr(null);
    const body = JSON.stringify({
      project_id: projectId, title: title.trim(), date: when.toISOString(),
      duration_hours: parseFloat(duration.replace(",", ".")) || 1, location: location.trim(), note: note.trim(),
      assigned_user_ids: assignees, status, kind,
    });
    try {
      if (editing) await api(`/schedules/${schedule!.id}`, { method: "PUT", body });
      else await api("/schedules", { method: "POST", body });
      onClose();
      onSaved(when);
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await api(`/schedules/${schedule!.id}`, { method: "DELETE" });
      onClose();
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Silinemedi");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable testID="schedule-cancel" onPress={onClose} hitSlop={8}><Text style={{ color: colors.muted }}>Vazgeç</Text></Pressable>
          <Text style={styles.title}>{editing ? "Kaydı Düzenle" : "Takvime Ekle"}</Text>
          <Pressable onPress={save} disabled={saving} testID="save-schedule" hitSlop={8}>
            <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{saving ? "..." : "Kaydet"}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.label}>Tür</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {KIND_OPTS.map((k) => (
                <Chip key={k.key} label={k.label} active={kind === k.key} onPress={() => setKind(k.key)} testID={`sch-kind-${k.key}`} />
              ))}
            </View>
          </View>
          <Field label="Başlık *" value={title} onChangeText={setTitle} placeholder={kind === "gorev" ? "Örn: Tapuya evrak teslimi" : "Örn: Arazi ölçümü"} testID="sch-title" />
          {!presetProjectId && (
            <View>
              <Text style={styles.label}>İş</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
                <Chip label="Bağımsız" active={!projectId} onPress={() => setProjectId(null)} testID="sch-project-none" />
                {projects.map((p) => (
                  <Chip key={p.id} label={p.name} active={projectId === p.id} onPress={() => setProjectId(p.id)} testID={`sch-project-${p.id}`} />
                ))}
              </ScrollView>
            </View>
          )}
          <DateTimeField label="Tarih ve Saat" value={when} onChange={setWhen} withTime testID="sch-datetime" />
          {editing && (
            <View>
              <Text style={styles.label}>Durum</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {STATUS_OPTS.map((s) => (
                  <Chip key={s.key} label={s.label} active={status === s.key} onPress={() => setStatus(s.key)} testID={`sch-status-${s.key}`} />
                ))}
              </View>
            </View>
          )}
          <View>
            <AssigneeChips team={team} selected={assignees} onChange={setAssignees} label="Görevli Çalışanlar" testIDPrefix="sch-assignee" />
            {!!projectId && assignees.length === 0 && !editing && (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: spacing.xs }}>Seçilmezse işin ekibi atanır.</Text>
            )}
          </View>
          <Field label="Süre (saat)" value={duration} onChangeText={setDuration} keyboardType="numeric" testID="sch-duration" />
          <Field label="Konum" value={location} onChangeText={setLocation} placeholder="Adres / ada-parsel" testID="sch-location" />
          <Field label="Not" value={note} onChangeText={setNote} multiline testID="sch-note" />
          {!!err && <Text testID="schedule-error" style={{ color: colors.error }}>{err}</Text>}
          {editing && (
            <Pressable testID="delete-schedule" onPress={remove} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={{ color: colors.error, fontWeight: "700" }}>{confirmDelete ? "Silmek için tekrar dokunun" : "Programı Sil"}</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  label: { fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs },
  deleteBtn: {
    height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm,
  },
});
