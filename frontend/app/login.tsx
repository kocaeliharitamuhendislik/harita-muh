import { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { Button } from "@/src/ui";

const LOGIN_BG = "https://images.unsplash.com/photo-1542621334-a254cf47733d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/projects");
    } catch (e: any) {
      setError(e?.message || "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: LOGIN_BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(28,28,30,0.3)", "rgba(28,28,30,0.95)"]}
        locations={[0, 1]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing["2xl"], paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <Ionicons name="map" size={28} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brandTitle}>HaritaPro</Text>
          </View>
          <Text style={styles.subtitle}>Harita Mühendislik Takip Sistemi</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Giriş Yap</Text>

            <Text style={styles.label}>E-posta</Text>
            <TextInput
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@firma.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            <Text style={styles.label}>Şifre</Text>
            <View style={styles.pwWrap}>
              <TextInput
                testID="login-password-input"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
              <Pressable testID="login-show-password" onPress={() => setShowPw((v) => !v)} style={styles.eye}>
                <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={colors.muted} />
              </Pressable>
            </View>

            {error ? (
              <Text testID="login-error" style={styles.error}>{error}</Text>
            ) : null}

            <View style={{ height: spacing.md }} />
            <Button testID="login-submit-button" label="Giriş Yap" onPress={onSubmit} loading={loading} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceInverse },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, justifyContent: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  logoBox: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  brandTitle: { color: colors.onSurfaceInverse, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: colors.onSurfaceInverse, opacity: 0.8, fontSize: 14, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  cardTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, backgroundColor: colors.surface,
    color: colors.onSurface, fontSize: 15, marginBottom: spacing.sm,
  },
  pwWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  eye: { position: "absolute", right: spacing.md, padding: spacing.xs },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
});
