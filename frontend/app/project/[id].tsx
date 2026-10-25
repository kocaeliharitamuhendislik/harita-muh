import { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, KeyboardAvoidingView, Platform, RefreshControl, Linking, TextInput, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { api, API_BASE, getToken } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Button, Card, Chip, StatusDot, fmtDate, Field } from "@/src/ui";
import { uploadForm } from "@/src/utils/upload";
import { AssigneeChips, useTeam, teamNames } from "@/src/components/team";
import { shareProjectReport } from "@/src/report";
import { useQueryClient } from "@tanstack/react-query";
import { ScheduleModal, Schedule } from "@/src/components/schedule-modal";
import { EditProjectModal } from "@/src/components/edit-project-modal";
import { EditDocSheet } from "@/src/components/edit-doc-sheet";
import { DOC_TYPES, catOf, categoryLabel, docLabel, stageInfo } from "@/src/workflows";

type Project = any;
type Doc = { id: string; name: string; category: string; content_type: string; size: number; storage_path: string; created_at: string; uploaded_by: string };
type Step = { id: string; institution: string; title: string; status: string; note: string };

const TABS = [
  { key: "evraklar", label: "Evraklar" },
  { key: "arazi", label: "Arazi" },
  { key: "surec", label: "Süreç" },
];
const INSTITUTIONS = ["Kadastro", "Tapu", "Belediye", "Vergi Dairesi", "Diğer"];
const STEP_STATUS: Record<string, string> = { beklemede: "Beklemede", onaylandi: "Onaylandı", reddedildi: "Reddedildi" };
const SCH_STATUS: Record<string, string> = { planlandi: "Planlandı", tamamlandi: "Tamamlandı", iptal: "İptal" };

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [tab, setTab] = useState<string>("evraklar");
  const [project, setProject] = useState<Project | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const team = useTeam();

  const makeReport = async () => {
    if (!project) return;
    setReporting(true);
    setNotice(null);
    try {
      await shareProjectReport(project, false, teamNames(team, project.assigned_user_ids));
    } catch (e: any) {
      setNotice(e?.message || "Rapor oluşturulamadı");
    } finally {
      setReporting(false);
    }
  };

  const load = useCallback(async () => {
    try { setProject(await api(`/projects/${id}`)); } catch { router.back(); }
    finally { setRefreshing(false); }
  }, [id, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!project) {
    return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle} numberOfLines={1}>{project.name}</Text>
          <Text style={styles.hSub} numberOfLines={1}>{categoryLabel(catOf(project))}{project.client_name ? ` • ${project.client_name}` : ""}</Text>
        </View>
        {isOwner && (
          <Pressable testID="edit-project-btn" onPress={() => setEditOpen(true)} style={xstyles.roundBtn}>
            <Ionicons name="create-outline" size={20} color={colors.onBrandTertiary} />
          </Pressable>
        )}
        {isOwner && (
          <Pressable testID="open-finance-btn" onPress={() => router.push(`/project-finance/${project.id}`)} style={xstyles.roundBtn}>
            <Ionicons name="wallet-outline" size={20} color={colors.onBrandTertiary} />
          </Pressable>
        )}
        <Pressable testID="report-btn" onPress={makeReport} disabled={reporting} style={xstyles.reportBtn}>
          {reporting ? (
            <ActivityIndicator size="small" color={colors.onBrandTertiary} />
          ) : (
            <Ionicons name="document-text-outline" size={18} color={colors.onBrandTertiary} />
          )}
          <Text style={xstyles.reportText}>PDF</Text>
        </Pressable>
      </View>
      {!!notice && <Text testID="report-notice" style={xstyles.notice}>{notice}</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ maxHeight: 56, flexGrow: 0, flexShrink: 0 }}>
        {TABS.map((t) => (
          <Chip key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} testID={`tab-${t.key}`} />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <TeamCard project={project} isOwner={isOwner} team={team} onChange={load} />
        {tab === "evraklar" && <DocsTab project={project} />}
        {tab === "arazi" && <SchedulesTab project={project} />}
        {tab === "surec" && (stageInfo(project) ? <StageTab project={project} onChange={load} /> : <StepsTab projectId={project.id} />)}
      </ScrollView>
      <EditProjectModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        project={project}
        onSaved={load}
        onDeleted={() => router.replace("/(tabs)/projects")}
      />
    </View>
  );
}

// -------- EVRAKLAR TAB --------
function DocsTab({ project }: { project: any }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const types = DOC_TYPES[catOf(project)];
  const [docs, setDocs] = useState<Doc[]>([]);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [permBlocked, setPermBlocked] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);

  const load = useCallback(async () => {
    try { setDocs(await api(`/projects/${project.id}/documents`)); } catch {}
  }, [project.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const known = new Set(types.map((t) => t.key));
  const others = docs.filter((d) => !known.has(d.category));
  const doneCount = types.filter((t) => docs.some((d) => d.category === t.key)).length;

  const getAsset = async (source: "file" | "camera" | "library", onDenied?: (blocked: boolean) => void) => {
    if (source === "file") {
      const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (r.canceled) return null;
      const a = r.assets[0];
      return { uri: a.uri, name: a.name, mimeType: a.mimeType };
    }
    if (source === "camera") {
      let perm = await ImagePicker.getCameraPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        if (onDenied) { onDenied(!perm.canAskAgain); return null; }
        setPermBlocked(!perm.canAskAgain);
        setErr("Fotoğraf çekmek için kamera izni gerekiyor.");
        return null;
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (r.canceled) return null;
      const a = r.assets[0];
      return { uri: a.uri, name: a.fileName || "foto.jpg", mimeType: a.mimeType || "image/jpeg" };
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (r.canceled) return null;
    const a = r.assets[0];
    return { uri: a.uri, name: a.fileName || "gorsel.jpg", mimeType: a.mimeType || "image/jpeg" };
  };

  const upload = async (source: "file" | "camera" | "library") => {
    const key = pickFor;
    setPickFor(null);
    if (!key) return;
    setErr(null); setPermBlocked(false);
    const asset = await getAsset(source);
    if (!asset) return;
    setUploading(key);
    try {
      const token = await getToken();
      const res = await uploadForm(`${API_BASE}/projects/${project.id}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
        fields: { category: key },
        files: { file: asset },
      });
      if (!res.ok) throw new Error(res.status === 402 ? "Depolama kredisi tükendi" : "Yükleme başarısız");
      load();
    } catch (e: any) {
      setErr(e?.message || "Yükleme başarısız");
    } finally { setUploading(null); }
  };

  const openDoc = async (d: Doc) => {
    try {
      const t = await api<{ token: string }>("/file-token");
      Linking.openURL(`${API_BASE}/documents/${d.id}/file?token=${t.token}`);
    } catch (e: any) { setErr(e?.message || "Dosya açılamadı"); }
  };

  const fileRow = (d: Doc) => (
    <View key={d.id} style={styles.fileRow}>
      <Pressable testID={`doc-${d.id}`} onPress={() => openDoc(d)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 36 }}>
        <Ionicons name={d.content_type.startsWith("image") ? "image-outline" : "document-outline"} size={18} color={colors.brandPrimary} />
        <Text style={styles.fileName} numberOfLines={1}>{d.name}</Text>
      </Pressable>
      <Pressable testID={`edit-doc-${d.id}`} onPress={() => setEditDoc(d)} hitSlop={12} style={{ minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="create-outline" size={18} color={colors.brandPrimary} />
      </Pressable>
    </View>
  );

  return (
    <>
      <Card>
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Evrak Durumu</Text>
          <Text testID="docs-progress" style={{ color: doneCount === types.length ? colors.success : colors.warning, fontWeight: "700" }}>
            {doneCount}/{types.length} tamam
          </Text>
        </View>
        <View style={[styles.progressTrack, { marginTop: spacing.md }]}>
          <View style={[styles.progressFill, { width: `${(doneCount / types.length) * 100}%` }]} />
        </View>
      </Card>

      {!!err && (
        <View style={styles.errBox}>
          <Text testID="docs-error" style={{ color: colors.error, flex: 1 }}>{err}</Text>
          {permBlocked && (
            <Pressable testID="open-settings-btn" onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
              <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 }}>Ayarları Aç</Text>
            </Pressable>
          )}
        </View>
      )}

      {types.map((t) => {
        const files = docs.filter((d) => d.category === t.key);
        const has = files.length > 0;
        return (
          <Card key={t.key}>
            <View style={styles.docTypeRow}>
              <Ionicons name={has ? "checkmark-circle" : "ellipse-outline"} size={24} color={has ? colors.success : colors.borderStrong} />
              <View style={{ flex: 1 }}>
                <Text style={styles.docTypeLabel}>{t.label}</Text>
                <Text style={{ fontSize: 12, color: has ? colors.muted : colors.warning }}>{has ? `${files.length} dosya` : "Eksik"}</Text>
              </View>
              <Pressable testID={`doc-add-${t.key}`} onPress={() => setPickFor(t.key)} disabled={!!uploading} style={styles.docAddBtn}>
                {uploading === t.key ? <ActivityIndicator size="small" color={colors.onBrandTertiary} /> : <Ionicons name="cloud-upload-outline" size={20} color={colors.onBrandTertiary} />}
              </Pressable>
            </View>
            {files.map(fileRow)}
          </Card>
        );
      })}

      {others.length > 0 && (
        <Card>
          <Text style={styles.cardTitle}>Diğer Dosyalar</Text>
          {others.map(fileRow)}
        </Card>
      )}

      <Modal visible={pickFor !== null} transparent animationType="slide" onRequestClose={() => setPickFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPickFor(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>{pickFor ? docLabel(pickFor) : ""} yükle</Text>
          <SheetOption icon="document-attach-outline" label="Dosya Seç (PDF, belge)" onPress={() => upload("file")} testID="src-file" />
          <SheetOption icon="camera-outline" label="Fotoğraf Çek" onPress={() => upload("camera")} testID="src-camera" />
          <SheetOption icon="images-outline" label="Galeriden Seç" onPress={() => upload("library")} testID="src-library" />
          <Pressable testID="src-cancel" onPress={() => setPickFor(null)} style={styles.sheetCancel}>
            <Text style={{ color: colors.muted, fontWeight: "600" }}>Vazgeç</Text>
          </Pressable>
        </View>
      </Modal>
      <EditDocSheet doc={editDoc} types={types} canDelete={!!editDoc && (user?.role === "owner" || editDoc.uploaded_by === user?.id)} onClose={() => setEditDoc(null)} onChanged={load} getAsset={getAsset} />
    </>
  );
}

function SheetOption({ icon, label, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.sheetOption}>
      <Ionicons name={icon} size={22} color={colors.brandPrimary} />
      <Text style={{ fontSize: 16, color: colors.onSurface }}>{label}</Text>
    </Pressable>
  );
}

// -------- ARAZİ TAB --------
function SchedulesTab({ project }: { project: any }) {
  const [items, setItems] = useState<Schedule[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const load = useCallback(async () => {
    try {
      const all = await api<Schedule[]>("/schedules");
      setItems(all.filter((s) => s.project_id === project.id));
    } catch {}
  }, [project.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <>
      <View style={styles.rowBetween}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurface }}>Arazi Programı</Text>
        <Pressable testID="add-project-schedule" onPress={() => { setEditing(null); setModalOpen(true); }} style={styles.addBtn}>
          <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
          <Text style={{ color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700" }}>Ekle</Text>
        </Pressable>
      </View>
      {items.length === 0 && <Card><Text style={{ color: colors.muted }}>Bu işe bağlı arazi programı yok.</Text></Card>}
      {items.map((it) => (
        <Pressable key={it.id} testID={`project-schedule-${it.id}`} onPress={() => { setEditing(it); setModalOpen(true); }}>
          <Card>
            <Text style={{ fontWeight: "700", fontSize: 15, color: colors.onSurface }}>{it.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
              {fmtDate(it.date)} • {new Date(it.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} • {it.duration_hours} saat
            </Text>
            {!!it.location && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>Konum: {it.location}</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              <StatusDot status={it.status} />
              <Text style={{ fontSize: 12, color: colors.onSurface }}>{SCH_STATUS[it.status] || it.status}</Text>
            </View>
          </Card>
        </Pressable>
      ))}
      <ScheduleModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        projects={[]}
        defaultDate={new Date()}
        schedule={editing}
        presetProjectId={project.id}
      />
    </>
  );
}

// -------- SÜREÇ AŞAMALARI (Kadastro / Belediye) --------
function StageTab({ project, onChange }: { project: any; onChange: () => void }) {
  const info = stageInfo(project)!;
  const last = info.stages.length - 1;
  const [target, setTarget] = useState(Math.min(info.idx + 1, last));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setTarget(Math.min(info.idx + 1, last)); }, [info.idx, last]);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await api(`/projects/${project.id}/stage`, { method: "POST", body: JSON.stringify({ stage_index: target, note }) });
      setNote("");
      onChange();
    } catch (e: any) { setErr(e?.message || "Kaydedilemedi"); }
    finally { setSaving(false); }
  };

  const history = [...(project.stage_history || [])].reverse();
  const sameStage = target === info.idx;

  return (
    <>
      <Card>
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Süreç Aşamaları</Text>
          <Text testID="stage-progress" style={{ color: info.done ? colors.success : colors.brandPrimary, fontWeight: "700" }}>{info.idx + 1}/{info.stages.length}</Text>
        </View>
        <View style={{ marginTop: spacing.md }}>
          {info.stages.map((s, i) => {
            const done = i < info.idx || (info.done && i === info.idx);
            const current = i === info.idx;
            const selected = i === target;
            return (
              <Pressable key={i} testID={`stage-${i}`} onPress={() => setTarget(i)} style={styles.stageRow}>
                <View style={{ alignItems: "center", width: 28 }}>
                  <View style={[
                    styles.stageDot,
                    done && { backgroundColor: colors.success, borderColor: colors.success },
                    current && !done && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
                  ]}>
                    {done ? <Ionicons name="checkmark" size={14} color={colors.onSuccess} />
                      : <Text style={{ fontSize: 12, fontWeight: "700", color: current ? colors.onBrandPrimary : colors.muted }}>{i + 1}</Text>}
                  </View>
                  {i < last && <View style={[styles.stageLine, i < info.idx && { backgroundColor: colors.success }]} />}
                </View>
                <View style={[styles.stageBody, selected && { backgroundColor: colors.brandTertiary }]}>
                  <Text style={[styles.stageText, current && { fontWeight: "700", color: colors.onSurface }]}>{s}</Text>
                  {current && <Text style={styles.stageTag}>Şu anki aşama</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{sameStage ? "Not Ekle" : "Aşamayı Güncelle"}</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: spacing.sm }}>
          Seçilen aşama: <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{info.stages[target]}</Text>
        </Text>
        <TextInput
          testID="stage-note"
          value={note}
          onChangeText={setNote}
          placeholder="Not (isteğe bağlı): örn. encümen tarihi, eksik evrak..."
          placeholderTextColor={colors.muted}
          multiline
          style={styles.noteInput}
        />
        {!!err && <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text>}
        <View style={{ height: spacing.md }} />
        <Button
          testID="stage-save"
          label={sameStage ? "Notu Kaydet" : "Aşamayı Kaydet"}
          onPress={save}
          loading={saving}
          disabled={sameStage && !note.trim()}
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Süreç Geçmişi</Text>
        {history.length === 0 && <Text style={{ color: colors.muted }}>Henüz güncelleme yok.</Text>}
        {history.map((h: any, i: number) => (
          <View key={i} style={styles.histRow}>
            <Text style={styles.stepTitle}>{info.stages[h.stage_index] ?? ""}</Text>
            {!!h.note && <Text style={styles.stepNote}>{h.note}</Text>}
            <Text style={styles.stepNote}>{h.by} • {fmtDate(h.at)} {new Date(h.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

// -------- KURUM TAB --------
function StepsTab({ projectId }: { projectId: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try { setSteps(await api(`/projects/${projectId}/steps`)); } catch {}
  }, [projectId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cycle = async (s: Step) => {
    const next = s.status === "beklemede" ? "onaylandi" : s.status === "onaylandi" ? "reddedildi" : "beklemede";
    await api(`/steps/${s.id}`, { method: "PUT", body: JSON.stringify({ ...s, status: next }) });
    load();
  };

  // group by institution
  const groups: Record<string, Step[]> = {};
  steps.forEach((s) => { (groups[s.institution] ||= []).push(s); });

  return (
    <>
      <View style={styles.rowBetween}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurface }}>Süreç Adımları</Text>
        <Pressable testID="add-step-btn" onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
          <Text style={{ color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700" }}>Ekle</Text>
        </Pressable>
      </View>

      {Object.keys(groups).length === 0 && (
        <Card><Text style={{ color: colors.muted }}>Henüz süreç adımı yok.</Text></Card>
      )}
      {Object.entries(groups).map(([inst, arr]) => (
        <Card key={inst}>
          <Text style={styles.instTitle}>{inst}</Text>
          {arr.map((s) => (
            <Pressable key={s.id} testID={`step-${s.id}`} onPress={() => cycle(s)} style={styles.stepRow}>
              <StatusDot status={s.status} />
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                {!!s.note && <Text style={styles.stepNote}>{s.note}</Text>}
              </View>
              <Text style={[styles.stepBadge, s.status === "onaylandi" && { color: colors.success }, s.status === "reddedildi" && { color: colors.error }]}>{STEP_STATUS[s.status] || s.status}</Text>
              <Pressable onPress={async (e) => { e.stopPropagation?.(); await api(`/steps/${s.id}`, { method: "DELETE" }); load(); }}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </Pressable>
          ))}
        </Card>
      ))}

      <AddStepModal visible={showAdd} onClose={() => setShowAdd(false)} projectId={projectId} onCreated={load} />
    </>
  );
}

function AddStepModal({ visible, onClose, projectId, onCreated }: any) {
  const insets = useSafeAreaInsets();
  const [institution, setInstitution] = useState("Kadastro");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const save = async () => {
    if (!title.trim()) return;
    await api(`/projects/${projectId}/steps`, { method: "POST", body: JSON.stringify({ institution, title: title.trim(), status: "beklemede", note }) });
    setTitle(""); setNote(""); onClose(); onCreated();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={onClose}><Text style={{ color: colors.muted }}>İptal</Text></Pressable>
          <Text style={styles.modalTitle}>Süreç Adımı Ekle</Text>
          <Pressable onPress={save} testID="save-step"><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Kaydet</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs }}>Kurum</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {INSTITUTIONS.map((i) => <Chip key={i} label={i} active={institution === i} onPress={() => setInstitution(i)} />)}
            </ScrollView>
          </View>
          <Field label="Adım başlığı" value={title} onChangeText={setTitle} placeholder="Örn: Çap belgesi" testID="step-title" />
          <Field label="Not" value={note} onChangeText={setNote} multiline />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// -------- EKİP --------
function TeamCard({ project, isOwner, team, onChange }: any) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [assigned, setAssigned] = useState<string[]>(project.assigned_user_ids || []);
  const [err, setErr] = useState<string | null>(null);
  const names = teamNames(team, assigned);

  const save = async (ids: string[]) => {
    const prev = assigned;
    setAssigned(ids);
    setErr(null);
    try {
      await api(`/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ assigned_user_ids: ids }) });
      qc.invalidateQueries({ queryKey: ["team"] });
      onChange();
    } catch (e: any) {
      setAssigned(prev);
      setErr(e?.message || "Kaydedilemedi");
    }
  };

  return (
    <Card>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
          <Ionicons name="people-outline" size={18} color={colors.brandPrimary} />
          <Text testID="team-names" style={{ fontSize: 14, color: colors.onSurface, flex: 1 }} numberOfLines={2}>
            {names.length ? names.join(", ") : "Ekip atanmadı"}
          </Text>
        </View>
        {isOwner && (
          <Pressable testID="edit-team-btn" onPress={() => setEditing((v) => !v)} hitSlop={8}>
            <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{editing ? "Tamam" : "Ata"}</Text>
          </Pressable>
        )}
      </View>
      {isOwner && editing && (
        <View style={{ marginTop: spacing.md }}>
          <AssigneeChips team={team} selected={assigned} onChange={save} label="" testIDPrefix="team-toggle" />
        </View>
      )}
      {!!err && <Text testID="team-error" style={{ color: colors.error, marginTop: spacing.sm, fontSize: 13 }}>{err}</Text>}
    </Card>
  );
}

const xstyles = StyleSheet.create({
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  reportBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, height: 44, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.brandTertiary,
  },
  reportText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 13 },
  notice: { color: colors.error, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, fontSize: 13 },
  phoneInput: {
    flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, backgroundColor: colors.surface, color: colors.onSurface, fontSize: 15,
  },
  phoneSave: { height: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  // WhatsApp brand green stays identical across themes
  waBtn: {
    marginTop: spacing.md, height: 48, borderRadius: radius.md, backgroundColor: "#25D366",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  hSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center", height: 56 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.md },
  gridFin: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpiSm: {
    width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  kpiLabel: { fontSize: 11, color: colors.muted, fontWeight: "700" },
  kpiValue: { fontSize: 18, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  progressTrack: { height: 10, backgroundColor: colors.surfaceTertiary, borderRadius: 5, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brandPrimary, borderRadius: 5 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  payRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  payAmt: { fontSize: 15, fontWeight: "700", color: colors.success },
  payDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  docGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  docCard: {
    width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 6, minHeight: 120, alignItems: "flex-start",
  },
  docIcon: {
    width: 48, height: 48, borderRadius: 10, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  docName: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  docCat: { fontSize: 11, color: colors.muted, fontWeight: "700" },
  instTitle: { fontSize: 15, fontWeight: "700", color: colors.brandPrimary, marginBottom: spacing.sm },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  stepTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  stepNote: { fontSize: 12, color: colors.muted, marginTop: 2 },
  stepBadge: { fontSize: 11, color: colors.warning, fontWeight: "700" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  errBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.surfaceSecondary },
  settingsBtn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  docTypeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  docTypeLabel: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  docAddBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  fileName: { flex: 1, fontSize: 13, color: colors.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: spacing.md, height: 56, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sheetCancel: { height: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  stageRow: { flexDirection: "row", gap: spacing.md, minHeight: 56 },
  stageDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  stageLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stageBody: { flex: 1, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.sm },
  stageText: { fontSize: 14, color: colors.onSurfaceTertiary },
  stageTag: { fontSize: 11, color: colors.brandPrimary, fontWeight: "700", marginTop: 2 },
  noteInput: { minHeight: 80, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, backgroundColor: colors.surface, color: colors.onSurface, fontSize: 14, textAlignVertical: "top" },
  histRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
});
