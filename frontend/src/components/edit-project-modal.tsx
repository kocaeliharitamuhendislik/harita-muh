import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { Chip, Field } from "@/src/ui";
import { PROJECT_CATEGORIES, ProjectCategory, catOf } from "@/src/workflows";

const STATUS_OPTS = [
  { key: "aktif", label: "Aktif" },
  { key: "bitti", label: "Bitti" },
  { key: "iptal", label: "İptal" },
];

// Sahip: işin adı, türü, müşterisi ve durumunu düzenler; işi silebilir.
export function EditProjectModal({
  visible, onClose, project, onSaved, onDeleted,
}: {
  visible: boolean;
  onClose: () => void;
  project: any;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<ProjectCategory>("diger");
  const [status, setStatus] = useState("aktif");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible || !project) return;
    setName(project.name || "");
    setClientName(project.client_name || "");
    setPhone(project.client_phone || "");
    setLocation(project.location || "");
    setDesc(project.description || "");
    setCategory(catOf(project));
    setStatus(project.status || "aktif");
    setErr(null);
    setConfirmDelete(false);
  }, [visible, project]);

  const categoryChanged = project && category !== catOf(project);

  const save = async () => {
    if (!name.trim()) { setErr("İş adı gerekli"); return; }
    setSaving(true); setErr(null);
    try {
      await api(`/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(), client_name: clientName.trim(), client_phone: phone.trim(),
          location: location.trim(), description: desc.trim(), category, status,
        }),
      });
      onClose();
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await api(`/projects/${project.id}`, { method: "DELETE" });
      onClose();
      onDeleted();
    } catch (e: any) { setErr(e?.message || "Silinemedi"); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable testID="edit-project-cancel" onPress={onClose} hitSlop={8}><Text style={{ color: colors.muted }}>Vazgeç</Text></Pressable>
          <Text style={styles.title}>İşi Düzenle</Text>
          <Pressable testID="edit-project-save" onPress={save} disabled={saving} hitSlop={8}>
            <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{saving ? "..." : "Kaydet"}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.label}>İş Türü</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              {PROJECT_CATEGORIES.map((c) => (
                <Chip key={c.key} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} testID={`edit-category-${c.key}`} />
              ))}
            </View>
            {categoryChanged && (
              <Text testID="edit-category-warning" style={{ color: colors.warning, fontSize: 12, marginTop: spacing.xs }}>
                Tür değişirse süreç aşaması baştan başlar ve evrak listesi yeni türe göre görünür.
              </Text>
            )}
          </View>
          <Field label="İş Adı *" value={name} onChangeText={(t: string) => { setName(t); if (err) setErr(null); }} testID="edit-name" />
          <Field label="Müşteri" value={clientName} onChangeText={setClientName} testID="edit-client" />
          <Field label="Müşteri Telefonu" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="edit-phone" />
          <Field label="Konum" value={location} onChangeText={setLocation} placeholder="İl / İlçe / Mahalle / Ada-Parsel" testID="edit-location" />
          <Field label="Açıklama" value={desc} onChangeText={setDesc} multiline testID="edit-desc" />
          <View>
            <Text style={styles.label}>Durum</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {STATUS_OPTS.map((s) => (
                <Chip key={s.key} label={s.label} active={status === s.key} onPress={() => setStatus(s.key)} testID={`edit-status-${s.key}`} />
              ))}
            </View>
          </View>
          {!!err && <Text testID="edit-project-error" style={{ color: colors.error }}>{err}</Text>}
          <Pressable testID="delete-project-btn" onPress={remove} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
            <Text style={{ color: colors.error, fontWeight: "700" }}>{confirmDelete ? "Tüm kayıtlarıyla silinecek, onaylamak için tekrar dokunun" : "İşi Sil"}</Text>
          </Pressable>
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
    minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, paddingHorizontal: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm,
  },
});
