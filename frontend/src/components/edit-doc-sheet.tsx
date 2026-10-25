import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, API_BASE, getToken } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { Button, Field } from "@/src/ui";
import { uploadForm, LocalFile } from "@/src/utils/upload";

type Doc = { id: string; name: string; category: string };
type Source = "file" | "camera" | "library";

export function EditDocSheet({
  doc, types, canDelete, onClose, onChanged, getAsset,
}: {
  doc: Doc | null;
  canDelete: boolean;
  types: { key: string; label: string }[];
  onClose: () => void;
  onChanged: () => void;
  getAsset: (s: Source, onDenied?: (blocked: boolean) => void) => Promise<LocalFile | null>;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [permBlocked, setPermBlocked] = useState(false);

  useEffect(() => {
    setName(doc?.name || "");
    setErr(null);
    setConfirmDel(false);
    setPermBlocked(false);
  }, [doc]);

  if (!doc) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null);
    try { await fn(); onChanged(); onClose(); }
    catch (e: any) { setErr(e?.message || "İşlem başarısız"); }
    finally { setBusy(null); }
  };

  const patch = (body: object, key: string) =>
    run(key, async () => { await api(`/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify(body) }); });

  const replace = async (s: Source) => {
    setErr(null); setPermBlocked(false);
    const asset = await getAsset(s, (blocked) => {
      setErr("Fotoğraf çekmek için kamera izni gerekiyor.");
      setPermBlocked(blocked);
    });
    if (!asset) return;
    await run(`src-${s}`, async () => {
      const token = await getToken();
      const res = await uploadForm(`${API_BASE}/documents/${doc.id}/file`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        files: { file: asset },
      });
      if (!res.ok) throw new Error(res.status === 402 ? "Depolama kredisi tükendi" : "Dosya değiştirilemedi");
    });
  };

  const del = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    await run("del", async () => { await api(`/documents/${doc.id}`, { method: "DELETE" }); });
  };

  const allTypes = types.some((t) => t.key === "diger") ? types : [...types, { key: "diger", label: "Diğer Dosya" }];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
            <Text style={s.title}>Evrakı Düzenle</Text>

            <Field label="Dosya adı" value={name} onChangeText={setName} testID="edit-doc-name" />
            <Button
              label="Adı Kaydet" variant="secondary" testID="edit-doc-save-name"
              loading={busy === "name"} disabled={!name.trim() || name.trim() === doc.name}
              onPress={() => patch({ name: name.trim() }, "name")}
            />

            <Text style={s.section}>Evrak türü</Text>
            <View style={s.chips}>
              {allTypes.map((t) => {
                const active = doc.category === t.key || (t.key === "diger" && !types.some((x) => x.key === doc.category));
                return (
                  <Pressable
                    key={t.key} testID={`edit-doc-type-${t.key}`} disabled={active || !!busy}
                    onPress={() => patch({ category: t.key }, `type-${t.key}`)}
                    style={[s.chip, active && s.chipActive]}
                  >
                    {busy === `type-${t.key}`
                      ? <ActivityIndicator size="small" color={colors.brandPrimary} />
                      : <Text style={[s.chipText, active && { color: colors.onBrandPrimary }]}>{t.label}</Text>}
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.section}>Dosyayı değiştir</Text>
            <View>
              {([
                ["file", "document-attach-outline", "Yeni Dosya Seç"],
                ["camera", "camera-outline", "Yeni Fotoğraf Çek"],
                ["library", "images-outline", "Galeriden Seç"],
              ] as const).map(([k, icon, label]) => (
                <Pressable key={k} testID={`edit-doc-src-${k}`} disabled={!!busy} onPress={() => replace(k)} style={s.option}>
                  <Ionicons name={icon} size={22} color={colors.brandPrimary} />
                  <Text style={{ fontSize: 16, color: colors.onSurface, flex: 1 }}>{label}</Text>
                  {busy === `src-${k}` && <ActivityIndicator size="small" color={colors.brandPrimary} />}
                </Pressable>
              ))}
            </View>

            {!!err && <Text testID="edit-doc-error" style={{ color: colors.error }}>{err}</Text>}
            {permBlocked && (
              <Button label="Ayarları Aç" variant="secondary" testID="edit-doc-open-settings" onPress={() => Linking.openSettings()} />
            )}
            {canDelete && (
              <Button
                label={confirmDel ? "Silmeyi Onayla" : "Evrakı Sil"} variant="danger" testID="edit-doc-delete"
                loading={busy === "del"} onPress={del}
              />
            )}
            <Pressable testID="edit-doc-cancel" onPress={onClose} style={s.cancel}>
              <Text style={{ color: colors.muted, fontWeight: "600" }}>Kapat</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, maxHeight: 640 },
  title: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  section: { fontSize: 13, fontWeight: "700", color: colors.muted, marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, height: 52, borderBottomWidth: 1, borderBottomColor: colors.divider },
  cancel: { height: 48, alignItems: "center", justifyContent: "center" },
});
