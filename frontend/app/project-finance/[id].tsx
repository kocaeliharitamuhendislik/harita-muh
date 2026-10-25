import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, KeyboardAvoidingView, Platform, RefreshControl, Linking, TextInput, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect, Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Card, fmtMoney, fmtDate, Field } from "@/src/ui";
import { DateTimeField } from "@/src/components/date-time-field";
import { UpcomingPayments, Planned } from "@/src/components/finance-parts";
import { useTeam, teamNames } from "@/src/components/team";
import { shareProjectReport, whatsappNumber } from "@/src/report";
import { categoryLabel } from "@/src/workflows";

type Payment = { id: string; amount: number; date: string; note: string };

// Sahibe özel finans katmanı: bir işin bakiyeleri, ödemeleri ve gelecek ödemeleri.
export default function ProjectFinance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const team = useTeam();
  const [project, setProject] = useState<any>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<"payment" | "planned" | null>(null);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, pays, pl] = await Promise.all([
        api(`/projects/${id}`),
        api<Payment[]>(`/projects/${id}/payments`),
        api<Planned[]>(`/planned-payments?project_id=${id}`),
      ]);
      setProject(p); setPayments(pays); setPlanned(pl);
    } catch (e: any) {
      setNotice(e?.message || "Yüklenemedi");
    } finally { setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (user && user.role !== "owner") return <Redirect href="/(tabs)/projects" />;
  if (!project) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;

  const pct = project.payment_completed ? 1 : project.agreed_amount > 0 ? Math.min(1, (project.received_amount || 0) / project.agreed_amount) : 0;

  const makeReport = async () => {
    setReporting(true); setNotice(null);
    try { await shareProjectReport(project, true, teamNames(team, project.assigned_user_ids)); }
    catch (e: any) { setNotice(e?.message || "Rapor oluşturulamadı"); }
    finally { setReporting(false); }
  };

  const deletePayment = async (pid: string) => {
    try { await api(`/payments/${pid}`, { method: "DELETE" }); load(); }
    catch (e: any) { setNotice(e?.message || "Silinemedi"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="pf-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle} numberOfLines={1}>{project.name}</Text>
          <Text style={styles.hSub} numberOfLines={1}>Finans • {categoryLabel(project.category)}</Text>
        </View>
        <Pressable testID="pf-report-btn" onPress={makeReport} disabled={reporting} style={styles.reportBtn}>
          {reporting ? <ActivityIndicator size="small" color={colors.onBrandTertiary} /> : <Ionicons name="document-text-outline" size={18} color={colors.onBrandTertiary} />}
          <Text style={styles.reportText}>PDF</Text>
        </Pressable>
      </View>
      {!!notice && <Text testID="pf-notice" style={styles.notice}>{notice}</Text>}

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.grid}>
          <Kpi label="Teklif" value={fmtMoney(project.offer_amount)} />
          <Kpi label="Anlaşılan" value={fmtMoney(project.agreed_amount)} />
          <Kpi label="Alınan" value={fmtMoney(project.received_amount)} color={colors.success} />
          <Kpi label="Kalan" value={fmtMoney(project.remaining_amount)} color={colors.warning} testID="pf-remaining" />
        </View>
        <Card>
          <Text style={styles.cardTitle}>Tahsilat</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${pct * 100}%` }]} /></View>
          <Text style={{ marginTop: 6, color: colors.muted, fontSize: 13 }}>%{Math.round(pct * 100)}</Text>
        </Card>

        <AmountsCard project={project} onSaved={load} />
        <ReminderCard project={project} onChange={load} />

        <UpcomingPayments planned={planned} onChanged={load} showProject={false} />
        <Pressable testID="add-planned-btn" onPress={() => setModal("planned")} style={styles.outlineBtn}>
          <Ionicons name="calendar-outline" size={18} color={colors.brandPrimary} />
          <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Gelecek Ödeme Planla</Text>
        </Pressable>

        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Alınan Ödemeler</Text>
            <Pressable testID="add-payment-btn" onPress={() => setModal("payment")} style={styles.addBtn}>
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
              <Pressable testID={`del-pay-${p.id}`} onPress={() => deletePayment(p.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          ))}
        </Card>
      </ScrollView>

      <MoneyModal
        visible={modal !== null}
        kind={modal ?? "payment"}
        onClose={() => setModal(null)}
        projectId={project.id}
        onSaved={load}
      />
    </View>
  );
}

function AmountsCard({ project, onSaved }: any) {
  const [offer, setOffer] = useState(String(project.offer_amount || ""));
  const [agreed, setAgreed] = useState(String(project.agreed_amount || ""));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;

  const patch = async (body: any, ok: string) => {
    setSaving(true); setMsg(null);
    try { await api(`/projects/${project.id}`, { method: "PATCH", body: JSON.stringify(body) }); setMsg(ok); onSaved(); }
    catch (e: any) { setMsg(e?.message || "Kaydedilemedi"); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <Text style={styles.cardTitle}>Teklif ve Anlaşma</Text>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field label="Teklif (₺)" value={offer} onChangeText={setOffer} keyboardType="numeric" testID="pf-offer" /></View>
        <View style={{ flex: 1 }}><Field label="Anlaşılan (₺)" value={agreed} onChangeText={setAgreed} keyboardType="numeric" testID="pf-agreed" /></View>
      </View>
      <Pressable testID="pf-save-amounts" disabled={saving} onPress={() => patch({ offer_amount: num(offer), agreed_amount: num(agreed) }, "Tutarlar kaydedildi")} style={[styles.primaryBtn, { marginTop: spacing.md }]}>
        <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>Tutarları Kaydet</Text>
      </Pressable>
      <Pressable
        testID="pf-toggle-completed"
        disabled={saving}
        onPress={() => patch({ payment_completed: !project.payment_completed }, project.payment_completed ? "Ödeme durumu geri alındı" : "Ödeme tamamlandı olarak işaretlendi")}
        style={[styles.outlineBtn, { marginTop: spacing.sm, borderColor: project.payment_completed ? colors.border : colors.success }]}
      >
        <Ionicons name={project.payment_completed ? "arrow-undo-outline" : "checkmark-done"} size={18} color={project.payment_completed ? colors.muted : colors.success} />
        <Text style={{ color: project.payment_completed ? colors.muted : colors.success, fontWeight: "700" }}>
          {project.payment_completed ? "Ödeme Tamamlandı (geri al)" : "Ödeme Tamamlandı"}
        </Text>
      </Pressable>
      {!!msg && <Text testID="pf-amounts-msg" style={{ color: colors.muted, marginTop: spacing.sm, fontSize: 13 }}>{msg}</Text>}
    </Card>
  );
}

function ReminderCard({ project, onChange }: any) {
  const [phone, setPhone] = useState(project.client_phone || "");
  const [editing, setEditing] = useState(!project.client_phone);
  const [err, setErr] = useState<string | null>(null);
  const remaining = project.remaining_amount || 0;

  const savePhone = async () => {
    setErr(null);
    try {
      await api(`/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ client_phone: phone.trim() }) });
      setEditing(false); onChange();
    } catch (e: any) { setErr(e?.message || "Telefon kaydedilemedi"); }
  };

  const send = () => {
    const msg =
      `Merhaba${project.client_name ? " " + project.client_name : ""}, "${project.name}" işi için ` +
      `kalan ödeme tutarınız ${fmtMoney(remaining)}'dir. Bilgilerinize sunar, iyi günler dileriz.`;
    Linking.openURL(`https://wa.me/${whatsappNumber(project.client_phone)}?text=${encodeURIComponent(msg)}`);
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
          <TextInput testID="client-phone-input" value={phone} onChangeText={setPhone} placeholder="Müşteri telefonu (05xx...)"
            placeholderTextColor={colors.muted} keyboardType="phone-pad" style={styles.phoneInput} />
          <Pressable testID="save-phone-btn" onPress={savePhone} disabled={!phone.trim()} style={[styles.phoneSave, !phone.trim() && { opacity: 0.5 }]}>
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>Kaydet</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={{ color: colors.muted, marginTop: spacing.xs }}>{project.client_phone}</Text>
      )}
      {!!err && <Text style={{ color: colors.error, marginTop: spacing.sm, fontSize: 13 }}>{err}</Text>}
      {remaining <= 0 ? (
        <Text style={{ color: colors.success, marginTop: spacing.md, fontWeight: "600" }}>Ödeme tamamlandı, hatırlatmaya gerek yok.</Text>
      ) : (
        <Pressable testID="whatsapp-reminder-btn" onPress={send} disabled={!project.client_phone} style={[styles.waBtn, !project.client_phone && { opacity: 0.5 }]}>
          <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>WhatsApp ile Hatırlat • {fmtMoney(remaining)}</Text>
        </Pressable>
      )}
    </Card>
  );
}

function MoneyModal({ visible, kind, onClose, projectId, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const isPlanned = kind === "planned";

  const save = async () => {
    const amt = parseFloat(amount.replace(",", "."));
    if (!amt || amt <= 0) { setErr("Geçerli bir tutar girin"); return; }
    setErr(null);
    try {
      if (isPlanned) {
        await api(`/projects/${projectId}/planned-payments`, { method: "POST", body: JSON.stringify({ amount: amt, due_date: date.toISOString(), note }) });
      } else {
        await api(`/projects/${projectId}/payments`, { method: "POST", body: JSON.stringify({ amount: amt, date: date.toISOString(), note }) });
      }
      setAmount(""); setNote(""); onClose(); onSaved();
    } catch (e: any) { setErr(e?.message || "Kaydedilemedi"); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: colors.muted }}>Vazgeç</Text></Pressable>
          <Text style={styles.modalTitle}>{isPlanned ? "Gelecek Ödeme" : "Ödeme Ekle"}</Text>
          <Pressable onPress={save} testID="save-money" hitSlop={8}><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Kaydet</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Field label="Tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="numeric" testID="money-amount" />
          <DateTimeField label={isPlanned ? "Vade Tarihi" : "Tahsilat Tarihi"} value={date} onChange={setDate} testID="money-date" />
          <Field label="Açıklama" value={note} onChangeText={setNote} multiline testID="money-note" />
          {!!err && <Text style={{ color: colors.error }}>{err}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Kpi({ label, value, color, testID }: any) {
  return (
    <View style={styles.kpi} testID={testID}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color && { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  hSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  reportText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 13 },
  notice: { color: colors.error, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: { width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  kpiLabel: { fontSize: 11, color: colors.muted, fontWeight: "700" },
  kpiValue: { fontSize: 18, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.md },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  track: { height: 10, backgroundColor: colors.surfaceTertiary, borderRadius: 5, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.brandPrimary, borderRadius: 5 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill },
  primaryBtn: { height: 48, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  outlineBtn: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary },
  payRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  payAmt: { fontSize: 15, fontWeight: "700", color: colors.success },
  payDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  phoneInput: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, backgroundColor: colors.surface, color: colors.onSurface, fontSize: 15 },
  phoneSave: { height: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  // WhatsApp brand green stays identical across themes
  waBtn: { marginTop: spacing.md, height: 48, borderRadius: radius.md, backgroundColor: "#25D366", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
});
