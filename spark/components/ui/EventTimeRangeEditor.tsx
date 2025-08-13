// components/ui/EventTimeRangeEditor.tsx
import React, { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";

type Palette = {
  name: string; bg: string; bg2: string; text: string; textMuted: string; glass: string; glassBorder: string;
  p1: string; p2: string; p3: string; p4: string;
};

export default function EventTimeRangeEditor({
  visible, onClose, P, eventId, startISO, endISO,
}:{
  visible: boolean;
  onClose: () => void;
  P: Palette;
  eventId: string;
  startISO?: string | null;
  endISO?: string | null;
}) {
  const [start, setStart] = useState<string>(startISO ? toLocalInput(startISO) : "");
  const [end, setEnd] = useState<string>(endISO ? toLocalInput(endISO) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(()=>{ // reset when reopened
    setStart(startISO ? toLocalInput(startISO) : "");
    setEnd(endISO ? toLocalInput(endISO) : "");
    setErr(null);
  }, [visible]);

  const onSave = async ()=>{
    setErr(null);
    // allow empty to clear, else must be valid
    const startUtc = start ? toUTC(start) : null;
    const endUtc = end ? toUTC(end) : null;

    if (startUtc && endUtc && new Date(startUtc) > new Date(endUtc)) {
      setErr("End must be after start.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("events")
        .update({ start_at: startUtc, end_at: endUtc })
        .eq("id", eventId);
      if (error) throw error;
      onClose();
    } catch (e:any) {
      setErr(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ position:"absolute", inset:0 }}>
        <LinearGradient colors={["rgba(0,0,0,0.25)","rgba(0,0,0,0.55)"]} start={{x:0,y:0}} end={{x:0,y:1}} style={{ position:"absolute", inset:0 }}/>
      </View>
      <View style={{ position:"absolute", inset:0, justifyContent:"center", alignItems:"center", padding:20 }}>
        <View style={{ width: Math.min(760, (Platform.OS==="web"?window.innerWidth:360)-20), borderRadius:18, overflow:"hidden",
          backgroundColor:P.bg2, borderWidth:1, borderColor:P.glassBorder }}>
          {/* header */}
          <View style={{ paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1, borderColor:P.glassBorder, flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
            <Text style={{ color:P.text, fontWeight:"700" }}>Set time range</Text>
            <TouchableOpacity onPress={onClose} style={{ padding:6 }}>
              <Ionicons name="close" size={18} color={P.textMuted}/>
            </TouchableOpacity>
          </View>

          {/* body */}
          <View style={{ padding:16, gap:10 }}>
            <Text style={{ color:P.textMuted, fontSize:12 }}>Format: <Text style={{ color:P.text, fontWeight:"700" }}>YYYY-MM-DD HH:mm</Text> (local time)</Text>
            <LabeledInput P={P} label="Start" value={start} onChangeText={setStart} placeholder="2025-08-14 19:30"/>
            <LabeledInput P={P} label="End"   value={end}   onChangeText={setEnd}   placeholder="2025-08-14 22:00"/>
            {err ? <Text style={{ color:"#ef4444" }}>{err}</Text> : null}
          </View>

          {/* footer */}
          <View style={{ padding:12, flexDirection:"row", justifyContent:"flex-end", gap:10, borderTopWidth:1, borderColor:P.glassBorder }}>
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12, borderWidth:1, borderColor:P.glassBorder, backgroundColor:P.glass }}>
              <Text style={{ color:P.text }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={onSave}
              style={{ paddingHorizontal:16, paddingVertical:10, borderRadius:12, borderWidth:1, borderColor:`${P.p1}AA`, backgroundColor:`${P.p1}26` }}>
              <Text style={{ color:"#F6F9FF", fontWeight:"700" }}>{saving? "Saving…" : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- small bits ---------- */
function LabeledInput({ P, label, ...rest }:{ P:Palette; label:string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={{ color:P.textMuted, marginBottom:6 }}>{label}</Text>
      <TextInput {...rest}
        autoCapitalize="none" placeholderTextColor={P.textMuted}
        style={{ color:P.text, borderWidth:1, borderColor:P.glassBorder, backgroundColor:P.glass,
          borderRadius:12, paddingHorizontal:12, paddingVertical:10, fontSize:15 }}
      />
    </View>
  );
}

/* ---------- time helpers ---------- */
// Convert ISO to "YYYY-MM-DD HH:mm" in local time
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n:number)=> String(n).padStart(2,"0");
  const y = d.getFullYear();
  const m = pad(d.getMonth()+1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
// Convert "YYYY-MM-DD HH:mm" (local) to ISO
function toUTC(localStr: string) {
  const parts = localStr.trim().replace("T"," ").split(/[^\d]/).filter(Boolean).map(Number);
  if (parts.length < 5) return null;
  const [y, m, d, hh, mm] = parts;
  const local = new Date(y, (m-1), d, hh, mm, 0);
  return local.toISOString();
}
