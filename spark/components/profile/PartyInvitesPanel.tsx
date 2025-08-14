// components/profile/PartyInvitesPanel.tsx
import React from "react";
import { View, Text, Pressable, Image, ActivityIndicator, Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import {
  acceptPartyInvite,
  declinePartyInvite,
  type PartyInviteRow,
} from "@/lib/partyInvites";

const fontHeavy = Platform.select({ ios: "Avenir-Heavy", android: "sans-serif-medium", default: "system-ui" });
const fontSans  = Platform.select({ ios: "Avenir-Book",  android: "sans-serif",        default: "system-ui" });

type P = { surface: string; text: string; textMuted: string; border: string; primary: string };

type InviteUI = PartyInviteRow & {
  inviter?: { name?: string | null; avatar_url?: string | null } | null;
  party_name?: string | null;
};

export default function PartyInvitesPanel({ P }: { P: P }) {
  const [uid, setUid] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<InviteUI[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // hydrate one row with party name + inviter profile
  const hydrate = React.useCallback(async (row: PartyInviteRow): Promise<InviteUI> => {
    // party name
    const [{ data: party }, { data: inviterProf }] = await Promise.all([
      supabase.from("parties").select("name").eq("id", row.party_id).maybeSingle(),
      supabase.from("profiles").select("display_name, avatar_url").eq("id", row.inviter_id).maybeSingle(),
    ]);
    return {
      ...row,
      party_name: (party as any)?.name ?? null,
      inviter: inviterProf
        ? { name: (inviterProf as any).display_name, avatar_url: (inviterProf as any).avatar_url }
        : null,
    };
  }, []);

  // initial load + realtime
  React.useEffect(() => {
    let alive = true;

    (async () => {
      const { data: me } = await supabase.auth.getUser();
      const id = me.user?.id ?? null;
      setUid(id);
      if (!id) { setLoading(false); return; }

      // initial list (pending to me)
      const { data, error } = await supabase
        .from("party_invites")
        .select("id, party_id, inviter_id, invitee_id, target_role, status, created_at")
        .eq("invitee_id", id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error) {
        setItems([]);
        setLoading(false);
        return;
      }

      // hydrate rows in parallel
      const hyd = await Promise.all((data ?? []).map(hydrate));
      if (!alive) return;
      setItems(hyd);
      setLoading(false);

      // realtime: invites to me
      const ch = supabase
        .channel(`profile:party_invites:${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "party_invites", filter: `invitee_id=eq.${id}` },
          async (payload: any) => {
            if (!alive) return;
            const evt = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
            if (evt === "INSERT") {
              const row = payload.new as PartyInviteRow;
              if (row.status !== "pending") return;
              const h = await hydrate(row);
              if (!alive) return;
              setItems(prev => {
                if (prev.find(x => x.id === row.id)) return prev;
                return [h, ...prev];
              });
            } else if (evt === "UPDATE") {
              const row = payload.new as PartyInviteRow;
              if (row.status !== "pending") {
                // accepted / declined / canceled -> remove from list
                setItems(prev => prev.filter(x => x.id !== row.id));
              } else {
                // still pending (rare), update fields
                setItems(prev => prev.map(x => (x.id === row.id ? { ...x, ...row } : x)));
              }
            } else if (evt === "DELETE") {
              const row = payload.old as PartyInviteRow;
              setItems(prev => prev.filter(x => x.id !== row.id));
            }
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(ch); };
    })();

    return () => { alive = false; };
  }, [hydrate]);

  async function accept(id: string) {
    setBusyId(id);
    try {
      await acceptPartyInvite(id);
      setItems(prev => prev.filter(x => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }
  async function decline(id: string) {
    setBusyId(id);
    try {
      await declinePartyInvite(id);
      setItems(prev => prev.filter(x => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, borderRadius: 12, padding: 16 }}>
      {loading ? (
        <ActivityIndicator />
      ) : items.length === 0 ? (
        <Text style={{ color: P.textMuted }}>No invites right now.</Text>
      ) : (
        items.map(inv => (
          <View
            key={inv.id}
            style={{
              borderWidth: 1,
              borderColor: P.border,
              borderRadius: 10,
              padding: 10,
              marginBottom: 8,
              backgroundColor: "rgba(255,255,255,0.03)",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Image
              source={{ uri: inv.inviter?.avatar_url || "https://placehold.co/80x80/png" }}
              style={{ width: 36, height: 36, borderRadius: 999, borderWidth: 1, borderColor: P.border }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: P.text, fontFamily: fontHeavy }}>
                {inv.party_name || "party"} 
              </Text>
              {inv.inviter?.name ? (
                <Text style={{ color: P.textMuted, fontFamily: fontSans, fontSize: 12, marginTop: 2 }}>
                  From {inv.inviter.name}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                disabled={busyId === inv.id}
                onPress={() => accept(inv.id)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                  borderWidth: 1, borderColor: P.primary, opacity: busyId === inv.id ? 0.6 : 1,
                }}
              >
                <Text style={{ color: P.text, fontFamily: fontHeavy }}>Accept</Text>
              </Pressable>
              <Pressable
                disabled={busyId === inv.id}
                onPress={() => decline(inv.id)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                  borderWidth: 1, borderColor: P.border, opacity: busyId === inv.id ? 0.6 : 1,
                }}
              >
                <Text style={{ color: P.text, fontFamily: fontHeavy }}>Decline</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
