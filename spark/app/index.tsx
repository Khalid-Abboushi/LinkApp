import React, { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  Animated,
  Easing,
  Pressable,
  Platform,
  ImageBackground,
  useWindowDimensions,
  SafeAreaView,
  Image,
} from "react-native";
import type { ImageSourcePropType } from "react-native";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import "./globals.css";
import * as Crypto from "expo-crypto";

type Mode = "signin" | "signup" | "forgot";

// background assets (place these files)
const heroDesktop = require("@/assets/images/spark-hero-desktop.png");
const heroMobile = require("@/assets/images/spark-hero-mobile.png");

/* =========================
   Helpers (derive + availability)
   ========================= */
const normalize = (s: string) => s.trim();

function dicebear(seed: string) {
  // tweak style to whatever you like: fun-emoji, thumbs, initials, etc.
  return `https://api.dicebear.com/8.x/fun-emoji/png?size=128&seed=${encodeURIComponent(seed)}`;
}

function toTitle(s: string) {
  if (!s) return s;
  const t = s.replace(/[_\-\.]+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
async function gravatar(email?: string | null) {
  if (!email) return null;
  try {
    const md5 = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.MD5,
      email.trim().toLowerCase()
    );
    return `https://www.gravatar.com/avatar/${md5}?d=identicon`;
  } catch {
    return null;
  }
}

/** Check username availability (profiles.username is citext + unique index). */
async function checkUsernameAvailable(username: string) {
  const u = normalize(username);
  if (!u) return false;
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("username", u); // citext → case-insensitive
  if (error) throw error;
  return (count ?? 0) === 0;
}

/** Check display-name availability (expects RPC display_name_exists(p_name text) boolean).
 * Falls back to a best-effort ilike check if RPC is missing.
 */
async function checkDisplayNameAvailable(displayName: string) {
  const d = normalize(displayName);
  if (!d) return false;

  const { data, error } = await supabase.rpc("display_name_exists", { p_name: d });
  if (!error) return !data;

  // Fallback if RPC isn't present (less strict than the DB index but OK as a precheck)
  const { count, error: e2 } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .ilike("display_name", d); // not trimming/normalizing like the index, but good enough for UX
  if (e2) throw e2;
  return (count ?? 0) === 0;
}

/** Idempotent: creates/patches profile using auth metadata first (works with/without triggers). */
async function ensureProfile(params: { userId: string; email?: string | null; username?: string | null }) {
  const { userId, email, username } = params;

  // read auth user + metadata
  const { data: me } = await supabase.auth.getUser();
  const meta = (me.user?.user_metadata ?? {}) as Record<string, any>;
  const metaName = (meta.display_name as string | undefined) || undefined;
  const metaUsername = (meta.username as string | undefined) || undefined;

  const fallbackUsername = `user_${userId.slice(0, 8)}`;
  const derivedUsername = (metaUsername || username || fallbackUsername).trim();
  const derivedDisplay =
    (metaName || (email ? (email.split("@")[0] ?? "").replace(/[_\-\.]+/g, " ") : derivedUsername)).trim();

  // Cross-platform default avatar (deterministic, no Node 'crypto')
  const defaultAvatar = dicebear(userId); // e.g. fun-emoji; change style if you like

  // fetch existing
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, theme, notifications_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const patch: Record<string, any> = {};
    if (!existing.username) patch.username = derivedUsername;
    if (!existing.display_name) patch.display_name = derivedDisplay;
    if (!existing.avatar_url) patch.avatar_url = defaultAvatar;
    if (existing.theme == null) patch.theme = "ELECTRIC_SUNSET";
    if (existing.notifications_enabled == null) patch.notifications_enabled = true;

    if (Object.keys(patch).length) {
      const { error: updErr } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (updErr) throw updErr;
    }
    return;
  }

  const { error: insErr } = await supabase.from("profiles").insert({
    id: userId,
    username: derivedUsername,
    display_name: derivedDisplay,
    avatar_url: defaultAvatar,
    theme: "ELECTRIC_SUNSET",
    notifications_enabled: true,
  });
  if (insErr) throw insErr;
}

/* =========================
   Component
   ========================= */
export default function AuthScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;
  const MAX_W = isMobile ? 360 : isTablet ? 520 : 520;
  const PADDING = isMobile ? 16 : 24;

  const { signIn } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); // used for both username + display name by default
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; global?: string }>({});

  // entrance anim
  const cardScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    cardScale.setValue(0.98);
    cardOpacity.setValue(0.96);
    Animated.parallel([
      Animated.timing(cardScale, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [mode]);

  const title = useMemo(
    () => (mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"),
    [mode]
  );

  function validate() {
    const e: typeof errors = {};
    if (!email) e.email = "Email is required.";
    if (mode !== "forgot" && !password) e.password = "Password is required.";
    if (mode === "signup") {
      if (!username) e.global = "Username is required.";
      else if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
        e.global = "Username must be 3–20 letters, numbers, or underscores.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    try {
      setBusy(true);

      if (mode === "signin") {
        const r = await signIn(email.trim(), password);
        if (r.error) throw new Error(r.error);

        const { data: me } = await supabase.auth.getUser();
        if (me.user?.id) {
          await ensureProfile({
            userId: me.user.id,
            email: me.user.email,
            username: null,
          });
        }
        router.replace("./(tabs)/discover");
        return;
      }

      if (mode === "signup") {
        const uname = username.trim();
        const displayCandidate = uname; // if you add a separate "Display name" field, use it here

        // pre-checks
        const okUser = await checkUsernameAvailable(uname);
        if (!okUser) throw new Error("Username already exists.");

        const okDisplay = await checkDisplayNameAvailable(displayCandidate);
        if (!okDisplay) throw new Error("Display name already exists.");

        // sign up with metadata (Option B triggers will pick this up too)
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: uname,
              display_name: displayCandidate,
            },
          },
        });
        if (error) throw error;

        // if a session exists immediately (e.g., email confirm off), create/patch profile now
        const { data: me } = await supabase.auth.getUser();
        if (me.user?.id) {
          await ensureProfile({
            userId: me.user.id,
            email: email.trim(),
            username: uname,
          });
          // keep metadata aligned (optional)
          await supabase.auth.updateUser({ data: { username: uname, display_name: displayCandidate } });
        }

        Alert.alert("Verify your email", "We sent you a confirmation email.");
        setMode("signin");
        return;
      }

      // forgot
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      Alert.alert("Email sent", "Check your inbox for a reset link.");
      setMode("signin");
    } catch (err: any) {
      setErrors((p) => ({ ...p, global: normalizeError(err?.message ?? String(err)) }));
    } finally {
      setBusy(false);
    }
  }

  const inputBase = {
    backgroundColor: theme.colors.card,
    color: theme.colors.text.primary,
    borderColor:
      errors.email || errors.password || errors.global ? theme.danger[500] : theme.colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  } as const;

  const hero = (isMobile ? heroMobile : heroDesktop) as ImageSourcePropType;

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS === "web" ? (
        <WebBackground source={hero} />
      ) : (
        <ImageBackground
          source={hero}
          blurRadius={18}
          resizeMode="cover"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
      )}

      <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.38)" }} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: PADDING, paddingTop: isMobile ? 8 : 16, paddingBottom: 8 }}>
          <Text style={{ color: "#fff", fontSize: isMobile ? 26 : 30, fontWeight: "800", letterSpacing: 0.5 }}>
            Spark
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 2 }}>Sign in to continue</Text>
        </View>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: PADDING }}>
          <Animated.View
            style={{
              width: "100%",
              maxWidth: MAX_W,
              transform: [{ scale: cardScale }],
              opacity: cardOpacity,
            }}
          >
            <Card
              variant="elevated"
              radius="xl"
              style={{
                padding: isMobile ? 16 : 20,
                backgroundColor: "rgba(18,19,26,0.72)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                ...(Platform.OS === "web" ? { backdropFilter: "blur(10px)" as any } : {}),
              }}
            >
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { key: "signin", label: "Sign in" },
                  { key: "signup", label: "Sign up" },
                  { key: "forgot", label: "Forgot" },
                ]}
              />

              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 8 }}>{title}</Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                {mode === "signup"
                  ? "Pick a unique username — this is public and others will see it."
                  : mode === "forgot"
                  ? "Enter your account email and we'll send a reset link."
                  : "Use your email and password."}
              </Text>

              {!!errors.global && (
                <View
                  style={{
                    backgroundColor: theme.danger[500] + "22",
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: theme.danger[500],
                  }}
                >
                  <Text style={{ color: theme.danger[500] }}>{errors.global}</Text>
                </View>
              )}

              <View style={{ gap: 12 }}>
                {mode === "signup" && (
                  <View>
                    <Label text="Username (public)" />
                    <TextInput
                      value={username}
                      onChangeText={setUsername}
                      placeholder="e.g. spark_dev"
                      placeholderTextColor="rgba(255,255,255,0.55)"
                      autoCapitalize="none"
                      style={inputBase}
                    />
                  </View>
                )}

                <View>
                  <Label text="Email" />
                  <TextInput
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                    }}
                    placeholder="you@example.com"
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={inputBase}
                  />
                  {!!errors.email && <FieldError text={errors.email} />}
                </View>

                {mode !== "forgot" && (
                  <View>
                    <Label text="Password" />
                    <TextInput
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                      }}
                      placeholder="••••••••"
                      placeholderTextColor="rgba(255,255,255,0.55)"
                      secureTextEntry
                      style={inputBase}
                    />
                    {!!errors.password && <FieldError text={errors.password} />}
                  </View>
                )}

                <Button
                  title={
                    busy
                      ? ""
                      : mode === "signin"
                      ? "Sign in"
                      : mode === "signup"
                      ? "Create account"
                      : "Send reset email"
                  }
                  onPress={handleSubmit}
                  loading={busy}
                />

                {mode === "signin" && (
                  <View style={{ gap: 8 }}>
                    <Button title="Forgot password?" variant="ghost" tone="neutral" onPress={() => setMode("forgot")} />
                    <Button title="Need an account? Sign up" variant="ghost" tone="neutral" onPress={() => setMode("signup")} />
                  </View>
                )}
                {mode === "signup" && (
                  <Button title="Have an account? Sign in" variant="ghost" tone="neutral" onPress={() => setMode("signin")} />
                )}
                {mode === "forgot" && (
                  <Button title="Back to sign in" variant="ghost" tone="neutral" onPress={() => setMode("signin")} />
                )}
              </View>
            </Card>
          </Animated.View>
        </View>

        <View style={{ padding: 12, alignItems: "center" }}>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, textAlign: "center", maxWidth: 640 }}>
            By continuing, you agree to our Terms & Privacy.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Fixed, memoized blurred background for web (prevents flashing on clicks) */
const WebBackground = memo(function WebBackground({ source }: { source: ImageSourcePropType }) {
  return (
    <Image
      source={source}
      resizeMode="cover"
      // @ts-ignore RN web styles
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        filter: "blur(18px)",
        transform: "translateZ(0) scale(1.05)",
        willChange: "transform, filter",
        backfaceVisibility: "hidden",
        contain: "paint",
        objectFit: "cover",
        pointerEvents: "none",
        zIndex: -1,
      }}
    />
  );
});

function Label({ text }: { text: string }) {
  return <Text style={{ color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>{text}</Text>;
}
function FieldError({ text }: { text: string }) {
  const theme = useTheme();
  return <Text style={{ color: theme.danger[500], marginTop: 4 }}>{text}</Text>;
}

function normalizeError(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid email or password")) return "Email or password is not correct.";
  if (m.includes("user already registered")) return "An account with this email already exists.";
  if (m.includes("email not confirmed")) return "Please confirm your email, then sign in.";
  if (m.includes("display name already exists")) return "Display name already exists.";
  if (m.includes("username already exists")) return "Username already exists.";
  if (m.includes("violates unique constraint") || m.includes("duplicate key")) return "That username is taken. Try another.";
  return msg;
}

/** Segmented control */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (val: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <View
      style={{
        backgroundColor: "rgba(0,0,0,0.35)",
        borderColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderRadius: 999,
        padding: 4,
        flexDirection: "row",
        gap: 6,
        marginBottom: 16,
      }}
    >
      {options.map((opt) => (
        <Seg key={String(opt.key)} label={opt.label} active={opt.key === value} onPress={() => onChange(opt.key)} />
      ))}
    </View>
  );
}

function Seg({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? "#357FFF" : "transparent",
        borderWidth: active ? 0 : 1,
        borderColor: "rgba(255,255,255,0.1)",
        transform: [{ scale: pressed ? 0.98 : 1 }],
        ...(Platform.OS === "web" ? { transition: "transform 160ms ease" } : {}),
      }}
    >
      <Text style={{ fontWeight: "700", fontSize: 14, color: "#fff", opacity: pressed ? 0.9 : 1 }}>{label}</Text>
    </Pressable>
  );
}
