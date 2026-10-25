import { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth-context";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { Button, Card, Chip, fmtMoney } from "@/src/ui";

type Project = {
  id: string;
  name: string;
  client_name: string;
  location: string;
  status: string;
  offer_amount?: number;
  agreed_amount?: number;
  received_amount?: number;
  remaining_amount?: number;
  assigned_user_ids?: string[];
};

const STATUSES = ["hepsi", "aktif", "bitti", "iptal"] as const;

export default function Projects() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("hepsi");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<Project[]>("/projects");
      setItems(data);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = items.filter((p) => filter === "hepsi" || p.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.greeting}>Merhaba, {user?.name?.split(" ")[0] || "Hoşgeldin"}</Text>
          <Text style={styles.title}>Projeler</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{isOwner ? "Sahip" : "Çalışan"}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={{ maxHeight: 56 }}
      >
        {STATUSES.map((s) => (
          <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} active={filter === s} onPress={() => setFilter(s)} testID={`filter-${s}`} />
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Henüz bir iş/görev atanmadı.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`project-card-${item.id}`}
            onPress={() => router.push(`/project/${item.id}`)}
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pName} numberOfLines={1}>{item.name}</Text>
                {!!item.client_name && <Text style={styles.pClient} numberOfLines={1}>{item.client_name}</Text>}
              </View>
              <View style={[styles.statusPill, pillColor(item.status)]}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>
            {!!item.location && (
              <View style={styles.row}>
                <Ionicons name="location-outline" size={14} color={colors.muted} />
                <Text style={styles.meta} numberOfLines={1}>{item.location}</Text>
              </View>
            )}
            {isOwner && (
              <View style={styles.financeRow}>
                <View style={styles.financeBox}>
                  <Text style={styles.financeLabel}>Anlaşılan</Text>
                  <Text style={styles.financeValue}>{fmtMoney(item.agreed_amount)}</Text>
                </View>
                <View style={styles.financeBox}>
                  <Text style={styles.financeLabel}>Kalan</Text>
                  <Text style={[styles.financeValue, { color: (item.remaining_amount || 0) > 0 ? colors.warning : colors.success }]}>
                    {fmtMoney(item.remaining_amount)}
                  </Text>
                </View>
              </View>
            )}
          </Pressable>
        )}
      />

      {isOwner && (
        <Pressable
          testID="create-project-fab"
          onPress={() => setShowCreate(true)}
          style={[styles.fab, { bottom: spacing.lg }]}
        >
          <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
        </Pressable>
      )}

      <CreateProjectModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </View>
  );
}

function pillColor(status: string) {
  if (status === "aktif") return { backgroundColor: colors.brandTertiary };
  if (status === "bitti") return { backgroundColor: "#DCFCE7" };
  return { backgroundColor: "#FEE2E2" };
}

function CreateProjectModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [desc, setDesc] = useState("");
  const [offer, setOffer] = useState("");
  const [agreed, setAgreed] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setName(""); setClientName(""); setLocation(""); setDesc(""); setOffer(""); setAgreed(""); setErr(null); };

  const save = async () => {
    if (!name.trim()) { setErr("Proje adı gerekli"); return; }
    setSaving(true);
    try {
      await api("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(), client_name: clientName.trim(), location: location.trim(),
          description: desc.trim(), status: "aktif",
          offer_amount: parseFloat(offer) || 0, agreed_amount: parseFloat(agreed) || 0,
          assigned_user_ids: [],
        }),
      });
      reset();
      onClose();
      onCreated();
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
          <Pressable testID="create-project-close" onPress={onClose}><Text style={styles.modalCancel}>İptal</Text></Pressable>
          <Text style={styles.modalTitle}>Yeni Proje</Text>
          <Pressable testID="create-project-save" onPress={save} disabled={saving}>
            <Text style={[styles.modalSave, { opacity: saving ? 0.5 : 1 }]}>{saving ? "..." : "Kaydet"}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field label="Proje Adı *" value={name} onChangeText={setName} placeholder="Örn: Tapu Aplikasyonu" testID="input-name" />
          <Field label="Müşteri" value={clientName} onChangeText={setClientName} placeholder="Müşteri adı" testID="input-client" />
          <Field label="Lokasyon" value={location} onChangeText={setLocation} placeholder="İl / İlçe / Mahalle" testID="input-location" />
          <Field label="Açıklama" value={desc} onChangeText={setDesc} placeholder="Not" multiline testID="input-desc" />
          <Field label="Teklif Tutarı (₺)" value={offer} onChangeText={setOffer} keyboardType="numeric" testID="input-offer" />
          <Field label="Anlaşılan Tutar (₺)" value={agreed} onChangeText={setAgreed} keyboardType="numeric" testID="input-agreed" />
          {err && <Text style={{ color: colors.error }}>{err}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Field({ label, multiline, testID, ...rest }: any) {
  return (
    <View>
      <Text style={fstyles.label}>{label}</Text>
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[fstyles.input, multiline && { minHeight: 90, textAlignVertical: "top", paddingTop: spacing.md }]}
        {...rest}
      />
    </View>
  );
}

const fstyles = StyleSheet.create({
  label: { fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs },
  input: {
    minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface, fontSize: 15,
  },
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  greeting: { color: colors.muted, fontSize: 13, marginBottom: 2 },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  badge: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  badgeText: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center", height: 56 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  pName: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  pClient: { fontSize: 13, color: colors.muted, marginTop: 2 },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 11, fontWeight: "700", color: colors.onBrandTertiary, textTransform: "capitalize" },
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  meta: { color: colors.muted, fontSize: 13, flex: 1 },
  financeRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  financeBox: { flex: 1 },
  financeLabel: { fontSize: 11, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  financeValue: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  fab: {
    position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  empty: { alignItems: "center", padding: spacing["3xl"], gap: spacing.md },
  emptyText: { color: colors.muted, fontSize: 15 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  modalCancel: { fontSize: 15, color: colors.muted },
  modalSave: { fontSize: 15, fontWeight: "700", color: colors.brandPrimary },
});
