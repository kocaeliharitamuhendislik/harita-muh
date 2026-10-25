import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Button, Card } from "@/src/ui";
import { Field } from "./projects";

type User = { id: string; name: string; email: string; role: string; disabled: boolean };

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isOwner = user?.role === "owner";
  const [users, setUsers] = useState<User[]>([]);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    if (!isOwner) return;
    try { setUsers(await api<User[]>("/users")); } catch {}
  }, [isOwner]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const removeUser = async (uid: string) => {
    try { await api(`/users/${uid}`, { method: "DELETE" }); load(); } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Ayarlar</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 100 }}>
        <Card>
          <View style={styles.row}>
            <View style={styles.avatar}><Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>{user?.name?.[0] || "?"}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              <Text style={styles.role}>{isOwner ? "İşletme Sahibi" : "Çalışan"}</Text>
            </View>
          </View>
        </Card>

        {isOwner && (
          <Card>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Çalışanlar</Text>
              <Pressable testID="invite-btn" onPress={() => setShowInvite(true)} style={styles.addBtn}>
                <Ionicons name="person-add" size={16} color={colors.onBrandPrimary} />
                <Text style={{ color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700" }}>Ekle</Text>
              </Pressable>
            </View>
            {users.filter((u) => u.role !== "owner").length === 0 && (
              <Text style={{ color: colors.muted, marginTop: spacing.md }}>Henüz çalışan yok.</Text>
            )}
            {users.filter((u) => u.role !== "owner").map((u) => (
              <View key={u.id} style={styles.userRow}>
                <View style={styles.avatarSm}><Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>{u.name[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{u.name}</Text>
                  <Text style={styles.userEmail}>{u.email}</Text>
                </View>
                <Pressable testID={`delete-user-${u.id}`} onPress={() => removeUser(u.id)}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        <Button testID="logout-btn" label="Çıkış Yap" variant="ghost" onPress={onLogout} />
      </ScrollView>

      <InviteModal visible={showInvite} onClose={() => setShowInvite(false)} onCreated={load} />
    </View>
  );
}

function InviteModal({ visible, onClose, onCreated }: any) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErr(null);
    if (!name.trim() || !email.trim() || password.length < 6) {
      setErr("Tüm alanları doldurun (şifre en az 6)"); return;
    }
    setSaving(true);
    try {
      await api("/users", { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim(), password }) });
      setName(""); setEmail(""); setPassword("");
      onClose(); onCreated();
    } catch (e: any) { setErr(e?.message || "Hata"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={onClose}><Text style={{ color: colors.muted }}>İptal</Text></Pressable>
          <Text style={styles.modalTitle}>Çalışan Ekle</Text>
          <Pressable onPress={save} disabled={saving} testID="save-invite"><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Kaydet</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field label="Ad Soyad" value={name} onChangeText={setName} testID="inv-name" />
          <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" testID="inv-email" />
          <Field label="Geçici Şifre" value={password} onChangeText={setPassword} secureTextEntry testID="inv-pw" />
          {err && <Text style={{ color: colors.error }}>{err}</Text>}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Çalışan bu bilgilerle giriş yapacak. Lütfen güvenli bir şifre paylaşın.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarSm: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  email: { fontSize: 13, color: colors.muted, marginTop: 2 },
  role: { fontSize: 12, color: colors.brandPrimary, fontWeight: "700", marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  userRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  userName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  userEmail: { fontSize: 12, color: colors.muted },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
});
