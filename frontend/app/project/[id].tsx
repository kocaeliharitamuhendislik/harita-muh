import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, KeyboardAvoidingView, Platform, RefreshControl, Linking } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { api, API_BASE, getToken } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Button, Card, Chip, StatusDot, fmtMoney, fmtDate, label } from "@/src/ui";
import { uploadForm } from "@/src/utils/upload";
import { Field } from "../(tabs)/projects";
import { DateTimeField } from "@/src/components/date-time-field";
import { AssigneeChips, useTeam, teamNames } from "@/src/components/team";
import { shareProjectReport, whatsappNumber } from "@/src/report";
import { TextInput, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

type Project = any;
type Doc = { id: string; name: string; category: string; content_type: string; size: number; storage_path: string; created_at: string };
type Payment = { id: string; amount: number; date: string; note: string };
type Step = { id: string; institution: string; title: string; status: string; note: string };

const TABS_OWNER = ["finans", "evraklar", "arazi", "kurum"] as const;
const TABS_EMP = ["evraklar", "arazi", "kurum"] as const;
const DOC_CATS = ["tapu", "imar", "kroki", "foto", "diger"];
const INSTITUTIONS = ["Kadastro", "Tapu", "Belediye", "Vergi Dairesi", "Diğer"];

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const TABS = isOwner ? TABS_OWNER : TABS_EMP;
  const [tab, setTab] = useState<string>(TABS[0]);
  const [project, setProject] = useState<Project | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const team = useTeam();

  const makeReport = async () => {
    if (!project) return;
    setReporting(true);
    setNotice(null);
    try {
      await shareProjectReport(project, isOwner, teamNames(team, project.assigned_user_ids));
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
          {!!project.client_name && <Text style={styles.hSub} numberOfLines={1}>{project.client_name}</Text>}
        </View>
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ maxHeight: 56 }}>
        {TABS.map((t) => (
          <Chip key={t} label={label(t)} active={tab === t} onPress={() => setTab(t)} testID={`tab-${t}`} />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <TeamCard project={project} isOwner={isOwner} team={team} onChange={load} />
        {tab === "finans" && isOwner && <FinanceTab project={project} onChange={load} />}
        {tab === "evraklar" && <DocsTab projectId={project.id} />}
        {tab === "arazi" && <SchedulesTab projectId={project.id} />}
        {tab === "kurum" && <StepsTab projectId={project.id} />}
      </ScrollView>
    </View>
  );
}

// -------- FINANS TAB --------
function FinanceTab({ project, onChange }: { project: any; onChange: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showPay, setShowPay] = useState(false);
  const load = useCallback(async () => {
    try { setPayments(await api(`/projects/${project.id}/payments`)); } catch {}
  }, [project.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pct = project.agreed_amount > 0 ? Math.min(1, (project.received_amount || 0) / project.agreed_amount) : 0;

  return (
    <>
      <View style={styles.gridFin}>
        <KpiSm label="Teklif" value={fmtMoney(project.offer_amount)} />
        <KpiSm label="Anlaşılan" value={fmtMoney(project.agreed_amount)} />
        <KpiSm label="Alınan" value={fmtMoney(project.received_amount)} color={colors.success} />
        <KpiSm label="Kalan" value={fmtMoney(project.remaining_amount)} color={colors.warning} />
      </View>
      <Card>
        <Text style={styles.cardTitle}>Tahsilat</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
        </View>
        <Text style={{ marginTop: 6, color: colors.muted, fontSize: 13 }}>%{Math.round(pct * 100)}</Text>
      </Card>
      <ReminderCard project={project} onChange={onChange} />
      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Ödemeler</Text>
          <Pressable testID="add-payment-btn" onPress={() => setShowPay(true)} style={styles.addBtn}>
            <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
            <Text style={{ color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700" }}>Ekle</Text>
          </Pressable>
        </View>
        {payments.length === 0 && <Text style={{ color: colors.muted, marginTop: spacing.sm }}>Henüz ödeme yok.</Text>}
        {payments.map((p) => (
          <View key={p.id} style={styles.payRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.payAmt}>{fmtMoney(p.amount)}</Text>
              <Text style={styles.payDate}>{fmtDate(p.date)} {p.note ? "• " + p.note : ""}</Text>
            </View>
            <Pressable testID={`del-pay-${p.id}`} onPress={async () => { await api(`/payments/${p.id}`, { method: "DELETE" }); load(); onChange(); }}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </Pressable>
          </View>
        ))}
      </Card>

      <AddPaymentModal visible={showPay} onClose={() => setShowPay(false)} projectId={project.id} onCreated={() => { load(); onChange(); }} />
    </>
  );
}

function AddPaymentModal({ visible, onClose, projectId, onCreated }: any) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [note, setNote] = useState("");
  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt) return;
    await api(`/projects/${projectId}/payments`, { method: "POST", body: JSON.stringify({ amount: amt, date: date.toISOString(), note }) });
    setAmount(""); setNote(""); onClose(); onCreated();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={onClose}><Text style={{ color: colors.muted }}>İptal</Text></Pressable>
          <Text style={styles.modalTitle}>Ödeme Ekle</Text>
          <Pressable onPress={save} testID="save-payment"><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Kaydet</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field label="Tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="numeric" testID="pay-amount" />
          <DateTimeField label="Tahsilat Tarihi" value={date} onChange={setDate} testID="pay-date" />
          <Field label="Açıklama" value={note} onChangeText={setNote} multiline />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// -------- EVRAKLAR TAB --------
function DocsTab({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [cat, setCat] = useState("diger");

  const load = useCallback(async () => {
    try { setDocs(await api(`/projects/${projectId}/documents`)); } catch {}
  }, [projectId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickAndUpload = async (fromCamera = false) => {
    let asset: { uri: string; name?: string; mimeType?: string } | null = null;
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (r.canceled) return;
      const a = r.assets[0];
      asset = { uri: a.uri, name: a.fileName || "foto.jpg", mimeType: a.mimeType || "image/jpeg" };
    } else {
      const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (r.canceled) return;
      const a = r.assets[0];
      asset = { uri: a.uri, name: a.name, mimeType: a.mimeType };
    }
    if (!asset) return;
    setUploading(true);
    try {
      const token = await getToken();
      await uploadForm(`${API_BASE}/projects/${projectId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
        fields: { category: cat },
        files: { file: asset },
      });
      load();
    } finally { setUploading(false); }
  };

  const openDoc = async (d: Doc) => {
    const token = await getToken();
    if (Platform.OS === "web") {
      const t = await api<{ token: string }>("/file-token");
      Linking.openURL(`${API_BASE}/documents/${d.id}/file?token=${t.token}`);
    } else {
      const t = await api<{ token: string }>("/file-token");
      Linking.openURL(`${API_BASE}/documents/${d.id}/file?token=${t.token}`);
    }
  };

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>Kategori</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
          {DOC_CATS.map((c) => <Chip key={c} label={label(c)} active={cat === c} onPress={() => setCat(c)} testID={`doc-cat-${c}`} />)}
        </ScrollView>
        <View style={{ height: spacing.md }} />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Button label="Dosya Seç" onPress={() => pickAndUpload(false)} loading={uploading} testID="pick-file" /></View>
          <View style={{ flex: 1 }}><Button label="Fotoğraf Çek" variant="secondary" onPress={() => pickAndUpload(true)} testID="pick-camera" /></View>
        </View>
      </Card>

      <View style={styles.docGrid}>
        {docs.length === 0 && <Text style={{ color: colors.muted }}>Henüz dosya yok.</Text>}
        {docs.map((d) => (
          <Pressable key={d.id} testID={`doc-${d.id}`} onPress={() => openDoc(d)} style={styles.docCard}>
            <View style={styles.docIcon}>
              <Ionicons name={d.content_type.startsWith("image") ? "image" : "document"} size={28} color={colors.brandPrimary} />
            </View>
            <Text style={styles.docName} numberOfLines={2}>{d.name}</Text>
            <Text style={styles.docCat}>{label(d.category)}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

// -------- ARAZİ TAB --------
function SchedulesTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const load = useCallback(async () => {
    try {
      const all = await api<any[]>("/schedules");
      setItems(all.filter((s) => s.project_id === projectId));
    } catch {}
  }, [projectId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (items.length === 0) {
    return <Card><Text style={{ color: colors.muted }}>Bu projeye bağlı arazi programı yok. Takvim sekmesinden ekleyebilirsiniz.</Text></Card>;
  }
  return (
    <>
      {items.map((it) => (
        <Card key={it.id}>
          <Text style={{ fontWeight: "700", fontSize: 15, color: colors.onSurface }}>{it.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
            {fmtDate(it.date)} • {new Date(it.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} • {it.duration_hours}sa
          </Text>
          {!!it.location && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>📍 {it.location}</Text>}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
            <StatusDot status={it.status} />
            <Text style={{ fontSize: 12, color: colors.onSurface, textTransform: "capitalize" }}>{it.status}</Text>
          </View>
        </Card>
      ))}
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
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurface }}>Kurum Süreçleri</Text>
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
              <Text style={[styles.stepBadge, s.status === "onaylandi" && { color: colors.success }, s.status === "reddedildi" && { color: colors.error }]}>{s.status}</Text>
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

// -------- WHATSAPP HATIRLATMA --------
function ReminderCard({ project, onChange }: any) {
  const [phone, setPhone] = useState(project.client_phone || "");
  const [editing, setEditing] = useState(!project.client_phone);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const remaining = project.remaining_amount || 0;

  const savePhone = async () => {
    setPhoneErr(null);
    try {
      await api(`/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ client_phone: phone.trim() }) });
      setEditing(false);
      onChange();
    } catch (e: any) {
      setPhoneErr(e?.message || "Telefon kaydedilemedi");
    }
  };

  const send = () => {
    const num = whatsappNumber(project.client_phone || phone);
    const msg =
      `Merhaba${project.client_name ? " " + project.client_name : ""}, "${project.name}" işi için ` +
      `kalan ödeme tutarınız ${fmtMoney(remaining)}'dir. Bilgilerinize sunar, iyi günler dileriz.`;
    Linking.openURL(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`);
  };

  return (
    <Card>
      <View style={styles.rowBetween}>
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Ödeme Hatırlatma</Text>
        {!editing && (
          <Pressable testID="edit-phone-btn" onPress={() => setEditing(true)} hitSlop={8}>
            <Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>Telefonu düzenle</Text>
          </Pressable>
        )}
      </View>
      {editing ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <TextInput
            testID="client-phone-input"
            value={phone}
            onChangeText={setPhone}
            placeholder="Müşteri telefonu (05xx...)"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            style={xstyles.phoneInput}
          />
          <Pressable testID="save-phone-btn" onPress={savePhone} disabled={!phone.trim()} style={[xstyles.phoneSave, !phone.trim() && { opacity: 0.5 }]}>
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>Kaydet</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={{ color: colors.muted, marginTop: spacing.xs }}>{project.client_phone}</Text>
      )}
      {!!phoneErr && <Text testID="phone-error" style={{ color: colors.error, marginTop: spacing.sm, fontSize: 13 }}>{phoneErr}</Text>}
      {remaining <= 0 ? (
        <Text style={{ color: colors.success, marginTop: spacing.md, fontWeight: "600" }}>Ödeme tamamlandı, hatırlatmaya gerek yok.</Text>
      ) : (
        <Pressable
          testID="whatsapp-reminder-btn"
          onPress={send}
          disabled={!project.client_phone}
          style={[xstyles.waBtn, !project.client_phone && { opacity: 0.5 }]}
        >
          <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>WhatsApp ile Hatırlat • {fmtMoney(remaining)}</Text>
        </Pressable>
      )}
    </Card>
  );
}

const xstyles = StyleSheet.create({
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

function KpiSm({ label, value, color }: any) {
  return (
    <View style={styles.kpiSm}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color && { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: { padding: spacing.xs },
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
  kpiLabel: { fontSize: 11, color: colors.muted, fontWeight: "700", textTransform: "uppercase" },
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
  docCat: { fontSize: 11, color: colors.muted, textTransform: "uppercase", fontWeight: "700" },
  instTitle: { fontSize: 15, fontWeight: "700", color: colors.brandPrimary, marginBottom: spacing.sm },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  stepTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  stepNote: { fontSize: 12, color: colors.muted, marginTop: 2 },
  stepBadge: { fontSize: 11, color: colors.warning, textTransform: "uppercase", fontWeight: "700" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
});
