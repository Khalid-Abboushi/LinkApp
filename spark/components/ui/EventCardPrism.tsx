// components/ui/EventCardPrism.tsx
import React from "react";
import {
  View,
  Text,
  ImageBackground,
  TouchableOpacity,
  Animated,
  Easing,
  Pressable,
  Modal,
  Platform,
  Dimensions,
  Image,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/lib/supabase";
import { BlurView } from "expo-blur";

/* =========================
   Palette + fonts
   ========================= */
export type Palette = {
  name: string;
  bg: string;
  bg2: string;
  text: string;
  textMuted: string;
  glass: string;
  glassBorder: string;
  p1: string; p2: string; p3: string; p4: string;
};

const fontHeavy = Platform.select({ ios: "Avenir-Heavy", android: "sans-serif-condensed", default: "system-ui" });
const fontSans  = Platform.select({ ios: "Avenir-Book",  android: "sans-serif",           default: "system-ui" });

/* =========================
   Types
   ========================= */
export type EventCardProps = {
  P: Palette;
  event: {
    id: string;
    party_id: string;
    active?: boolean | null;

    name: string;
    description?: string | null;
    location_name?: string | null;
    location_address?: string | null;
    added_by?: string | null;

    hero_url?: string | null;

    likes: number;
    dislikes: number;
    net: number;
    myVote: -1 | 0 | 1;

    start_at?: string | null;
    end_at?: string | null;

    dress_code?: number | null;

    my_rsvp?: "confirmed" | "pending" | "busy" | null;
  };
  onVote: (eventId: string, vote: -1 | 0 | 1) => void;

  canEditTime?: boolean;
  isOwner?: boolean;
  canEditEvent?: boolean;
  onEdit?: (ev: EventCardProps["event"]) => void;
};

/* =========================
   Helpers
   ========================= */
const pad = (n:number)=> String(n).padStart(2,"0");
function partsFromISO(iso?: string | null){
  if(!iso) return { date:"", time:"" };
  const d = new Date(iso);
  return { date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, time:`${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
function toISO(date:string, time:string){ if(!date||!time) return null; const dt=new Date(`${date}T${time}`); return isNaN(+dt)?null:dt.toISOString(); }
function fmtRange(start?:string|null,end?:string|null){
  if(!start && !end) return "Time TBA";
  const f=(iso:string)=>{ const d=new Date(iso); return {
    key:d.toDateString(),
    day:d.toLocaleDateString(undefined,{month:"short",day:"numeric"}),
    time:d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})
  }}; 
  if(start && end){ const s=f(start), e=f(end); return s.key===e.key?`${s.day} • ${s.time} – ${e.time}`:`${s.day} ${s.time} → ${e.day} ${e.time}`; }
  if(start){ const s=f(start); return `${s.day} • ${s.time}`; }
  const e=f(end!); return `${e.day} • ends ${e.time}`;
}

/* =========================
   Responsive scale (mobile tighter)
   ========================= */
const W = Dimensions.get("window").width;
const IS_WEB = Platform.OS === "web";
const IS_SMALL = W < 380;
const SCALE = IS_WEB ? 1 : (IS_SMALL ? 0.8 : 0.9);
const ms = (n:number)=> Math.round(n * SCALE);

/* =========================
   Dress code chip
   ========================= */
const DRESS_LABELS = ["Comfort","Casual","Smart","Dressy","Fancy"] as const;

function DressCodeChip({
  P, value, editable, onChange,
}:{ P:Palette; value:number; editable:boolean; onChange:(v:number)=>void }){
  const stops=5;
  return (
    <View style={{ flexDirection:"row", alignItems:"center", gap:ms(8) }}>
      <Text selectable={false} style={{ color:P.textMuted, fontSize:ms(12), minWidth:ms(64) }}>Dress code</Text>
      <View style={{ width:ms(170), height:ms(32), borderRadius:999, borderWidth:1, borderColor:P.glassBorder, backgroundColor:"rgba(0,0,0,0.15)", justifyContent:"center", paddingHorizontal:ms(12) }}>
        <View style={{ position:"absolute", left:ms(16), right:ms(16), height:ms(3), backgroundColor:"rgba(255,255,255,0.25)", borderRadius:2 }}/>
        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
          {Array.from({length:stops}).map((_,i)=>(
            <Pressable key={i} onPress={()=> editable && onChange(i)} disabled={!editable}>
              <View style={{ width:ms(14), height:ms(14), borderRadius:999, borderWidth:1, borderColor:i<=value?"#fff":P.glassBorder, backgroundColor:i<=value?"rgba(255,255,255,0.9)":"rgba(0,0,0,0.25)" }}/>
            </Pressable>
          ))}
        </View>
      </View>
      <Text selectable={false} numberOfLines={1} style={{ color:"#EAF0FF", fontSize:ms(12), minWidth:ms(50), textAlign:"right", opacity:0.9 }}>
        {DRESS_LABELS[value] ?? "—"}
      </Text>
    </View>
  );
}

/* =========================
   Added-by chip (top-left)
   ========================= */
function pickAccent(s:string|undefined|null, P:Palette){ const cols=[P.p1,P.p2,P.p3,P.p4]; let h=0; for(const ch of s||"") h=(h*31+ch.charCodeAt(0))>>>0; return cols[h%cols.length]; }
function AddedByChip({ P, username }:{ P:Palette; username:string }){
  const accent = pickAccent(username,P);
  const initial = (username?.[0]||"?").toUpperCase();
  return (
    <LinearGradient colors={[`${accent}EE`,`${accent}99`]} start={{x:0,y:0}} end={{x:1,y:1}}
      style={{ paddingVertical:ms(3), paddingRight:ms(10), paddingLeft:ms(6), borderRadius:999, borderWidth:1, borderColor:P.glassBorder, alignItems:"center", flexDirection:"row", gap:ms(6) }}>
      <View style={{ width:ms(20), height:ms(20), borderRadius:999, backgroundColor:"rgba(0,0,0,0.25)", alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"rgba(255,255,255,0.25)" }}>
        <Text selectable={false} style={{ color:"#fff", fontFamily:fontHeavy, fontSize:ms(11) }}>{initial}</Text>
      </View>
      <Text selectable={false} style={{ color:"#F6F9FF", fontSize:ms(11), fontFamily:fontSans }}>Added by {username}</Text>
    </LinearGradient>
  );
}

/* =========================
   Time editor modal
   ========================= */
function WebDateTimeRow({
  P, label, date, time, onDate, onTime, onClear,
}:{ P:Palette; label:string; date:string; time:string; onDate:(s:string)=>void; onTime:(s:string)=>void; onClear:()=>void }){
  return (
    <View style={{ marginBottom:ms(10) }}>
      <Text selectable={false} style={{ color:P.textMuted, marginBottom:ms(6) }}>{label}</Text>
      <View style={{ flexDirection:"row", alignItems:"center", gap:ms(8), flexWrap:"wrap" }}>
        {/* @ts-ignore */}
        <input type="date" value={date} onChange={(e:any)=>onDate(e.target.value)}
          style={{ color:"white", background:"transparent", border:`1px solid ${P.glassBorder}`, padding:`${ms(8)}px ${ms(10)}px`, borderRadius:12 }}/>
        {/* @ts-ignore */}
        <input type="time" value={time} onChange={(e:any)=>onTime(e.target.value)}
          style={{ color:"white", background:"transparent", border:`1px solid ${P.glassBorder}`, padding:`${ms(8)}px ${ms(10)}px`, borderRadius:12 }}/>
        <TouchableOpacity onPress={onClear} style={{ paddingHorizontal:ms(10), paddingVertical:ms(8), borderRadius:12, borderWidth:1, borderColor:P.glassBorder, backgroundColor:"rgba(255,255,255,0.06)" }}>
          <Ionicons name="backspace" size={ms(14)} color={P.textMuted}/>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function NativePickerRow({
  P, label, value, onPickDate, onPickTime, onClear,
}:{ P:Palette; label:string; value:Date|null; onPickDate:()=>void; onPickTime:()=>void; onClear:()=>void }){
  return (
    <View style={{ marginBottom:ms(10) }}>
      <Text selectable={false} style={{ color:P.textMuted, marginBottom:ms(6) }}>{label}</Text>
      <View style={{ flexDirection:"row", alignItems:"center", gap:ms(8), flexWrap:"wrap" }}>
        <TouchableOpacity onPress={onPickDate} style={{ paddingHorizontal:ms(10), paddingVertical:ms(8), borderRadius:12, borderWidth:1, borderColor:P.glassBorder, backgroundColor:P.glass }}>
          <Text selectable={false} style={{ color:P.text }}>{value ? value.toLocaleDateString() : "Pick date"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPickTime} style={{ paddingHorizontal:ms(10), paddingVertical:ms(8), borderRadius:12, borderWidth:1, borderColor:P.glassBorder, backgroundColor:P.glass }}>
          <Text selectable={false} style={{ color:P.text }}>{value ? value.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : "Pick time"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClear} style={{ paddingHorizontal:ms(10), paddingVertical:ms(8), borderRadius:12, borderWidth:1, borderColor:P.glassBorder, backgroundColor:"rgba(255,255,255,0.06)" }}>
          <Ionicons name="backspace" size={ms(14)} color={P.textMuted}/>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TimeEditor({
  P, visible, onClose, eventId, startISO, endISO,
}:{ P:Palette; visible:boolean; onClose:()=>void; eventId:string; startISO?:string|null; endISO?:string|null }){
  const sParts = partsFromISO(startISO), eParts = partsFromISO(endISO);
  const [sDate,setSDate] = React.useState(sParts.date);
  const [sTime,setSTime] = React.useState(sParts.time);
  const [eDate,setEDate] = React.useState(eParts.date);
  const [eTime,setETime] = React.useState(eParts.time);

  const [sNative,setSNative] = React.useState<Date|null>(startISO?new Date(startISO):null);
  const [eNative,setENative] = React.useState<Date|null>(endISO?new Date(endISO):null);
  const [show,setShow] = React.useState<null|"s-date"|"s-time"|"e-date"|"e-time">(null);
  const [saving,setSaving] = React.useState(false);
  const [err,setErr] = React.useState<string|null>(null);

  React.useEffect(()=>{ const sp=partsFromISO(startISO), ep=partsFromISO(endISO);
    setSDate(sp.date); setSTime(sp.time); setEDate(ep.date); setETime(ep.time);
    setSNative(startISO?new Date(startISO):null); setENative(endISO?new Date(endISO):null); setErr(null);
  },[visible,startISO,endISO]);

  const save = async ()=>{
    setErr(null);
    let sISO:string|null=null, eISO:string|null=null;
    if(IS_WEB){ sISO=toISO(sDate,sTime); eISO=toISO(eDate,eTime); } else { sISO=sNative? sNative.toISOString():null; eISO=eNative? eNative.toISOString():null; }
    if(sISO && eISO && new Date(sISO)>new Date(eISO)){ setErr("End must be after start."); return; }
    setSaving(true);
    try{
      const { error } = await supabase.from("events").update({ start_at:sISO, end_at:eISO }).eq("id", eventId);
      if(error) throw error; onClose();
    }catch(e:any){ setErr(e.message ?? "Failed to save"); } finally{ setSaving(false); }
  };

  const onChangeNative = (kind:"s-date"|"s-time"|"e-date"|"e-time", d?:Date)=>{
    if(!d){ setShow(null); return; }
    const merge=(base:Date|null, date:Date, isDate:boolean)=>{
      const b=base??new Date(); return isDate
        ? new Date(date.getFullYear(),date.getMonth(),date.getDate(),b.getHours(),b.getMinutes())
        : new Date(b.getFullYear(),b.getMonth(),b.getDate(),date.getHours(),date.getMinutes());
    };
    if(kind.startsWith("s")) setSNative(merge(sNative,d,kind.endsWith("date"))); else setENative(merge(eNative,d,kind.endsWith("date")));
    if(Platform.OS==="android") setShow(null);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ position:"absolute", inset:0 }}>
        <LinearGradient colors={["rgba(0,0,0,0.25)","rgba(0,0,0,0.55)"]} start={{x:0,y:0}} end={{x:0,y:1}} style={{ position:"absolute", inset:0 }}/>
      </View>
      <View style={{ position:"absolute", inset:0, justifyContent:"center", alignItems:"center", padding:ms(12) }}>
        <View style={{ width:Math.min(Dimensions.get("window").width-ms(12), 760), maxHeight:Math.min(Dimensions.get("window").height-ms(40), 680), borderRadius:16, overflow:"hidden", backgroundColor:P.bg2, borderWidth:1, borderColor:P.glassBorder }}>
          <View style={{ paddingHorizontal:ms(14), paddingVertical:ms(10), borderBottomWidth:1, borderColor:P.glassBorder, flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
            <Text selectable={false} style={{ color:P.text, fontFamily:fontHeavy }}>Set time range</Text>
            <TouchableOpacity onPress={onClose} style={{ padding:ms(4) }}><Ionicons name="close" size={ms(16)} color={P.textMuted}/></TouchableOpacity>
          </View>
          <View style={{ padding:ms(12) }}>
            {IS_WEB ? (
              <>
                <WebDateTimeRow P={P} label="Start" date={sDate} time={sTime} onDate={setSDate} onTime={setSTime} onClear={()=>{setSDate("");setSTime("");}}/>
                <WebDateTimeRow P={P} label="End"   date={eDate} time={eTime} onDate={setEDate} onTime={setETime} onClear={()=>{setEDate("");setETime("");}}/>
              </>
            ) : (
              <>
                <NativePickerRow P={P} label="Start" value={sNative} onPickDate={()=>setShow("s-date")} onPickTime={()=>setShow("s-time")} onClear={()=>setSNative(null)}/>
                <NativePickerRow P={P} label="End"   value={eNative} onPickDate={()=>setShow("e-date")} onPickTime={()=>setShow("e-time")} onClear={()=>setENative(null)}/>
                {show && <DateTimePicker value={(show.startsWith("s")?sNative:eNative) ?? new Date()} mode={show.endsWith("date")?"date":"time"} display={Platform.OS==="ios"?"inline":"default"} onChange={(_,d)=>onChangeNative(show,d||undefined)}/>}
              </>
            )}
          </View>
          {err ? <Text style={{ color:"#ef4444", paddingHorizontal:ms(14), marginTop:-ms(6) }}>{err}</Text> : null}
          <View style={{ padding:ms(12), flexDirection:"row", justifyContent:"flex-end", gap:ms(8), borderTopWidth:1, borderColor:P.glassBorder }}>
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal:ms(12), paddingVertical:ms(8), borderRadius:12, borderWidth:1, borderColor:P.glassBorder, backgroundColor:P.glass }}>
              <Text selectable={false} style={{ color:P.text, fontFamily:fontSans }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} style={{ paddingHorizontal:ms(14), paddingVertical:ms(8), borderRadius:12, borderWidth:1, borderColor:`${P.p1}AA`, backgroundColor:`${P.p1}26`, opacity:saving?0.7:1 }}>
              <Text selectable={false} style={{ color:"#F6F9FF", fontFamily:fontHeavy }}>{saving?"Saving…":"Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* =========================
   Roster modal (live)
   ========================= */
type RSVPStatus = "confirmed" | "pending" | "busy";
type RosterRow = {
  user_id: string;
  status: RSVPStatus;
  updated_at?: string | null;
  name: string;
  avatar_url: string | null;
};

function shortId(id?: string) {
  return id ? id.slice(0, 6) : "user";
}
function nameFromProfile(p: { display_name?: string | null; username?: string | null } | null | undefined): string {
  return (p?.display_name || p?.username || "").trim();
}

function RosterModal({
  P, eventId, visible, onClose,
}: {
  P: Palette; eventId: string; visible: boolean; onClose: () => void;
}) {
  const [rows, setRows] = React.useState<RosterRow[]>([]);

  const load = React.useCallback(async () => {
    // 1) RSVPs for this event
    const { data: rsvps, error } = await supabase
      .from("event_rsvps")
      .select("user_id,status,updated_at")
      .eq("event_id", eventId);

    if (error || !Array.isArray(rsvps)) {
      setRows([]);
      return;
    }

    // 2) unique user ids
    const ids = Array.from(new Set(rsvps.map(r => r.user_id).filter(Boolean)));
    // 3) fetch matching profiles (only existing columns)
    let pmap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .in("id", ids);
      (profs ?? []).forEach((p: any) => {
        pmap.set(p.id, { display_name: p.display_name ?? null, username: p.username ?? null, avatar_url: p.avatar_url ?? null });
      });
    }

    // 4) build final list
    const list: RosterRow[] = rsvps.map((r: any) => {
      const prof = pmap.get(r.user_id);
      const nice = nameFromProfile(prof) || shortId(r.user_id);
      return {
        user_id: r.user_id,
        status: r.status as RSVPStatus,
        updated_at: r.updated_at ?? null,
        name: nice,
        avatar_url: prof?.avatar_url ?? null,
      };
    });

    // sort: confirmed → pending → busy, then by name
    const order: Record<RSVPStatus, number> = { confirmed: 0, pending: 1, busy: 2 };
    list.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));

    setRows(list);
  }, [eventId]);

  React.useEffect(() => { if (visible) void load(); }, [visible, load]);

  // realtime updates to the roster for this event
  React.useEffect(() => {
    if (!visible) return;
    const ch = supabase
      .channel(`rsvp-${eventId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "event_rsvps", filter: `event_id=eq.${eventId}` },
        () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId, visible, load]);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ position:"absolute", inset:0, backgroundColor:"rgba(0,0,0,0.45)" }}/>
      <View style={{ position:"absolute", inset:0, justifyContent:"center", alignItems:"center", padding:ms(16) }}>
        <View style={{ width:Math.min(Dimensions.get("window").width-ms(16), 720), maxHeight:Dimensions.get("window").height*0.75, backgroundColor:P.bg2, borderWidth:1, borderColor:P.glassBorder, borderRadius:16, overflow:"hidden" }}>
          <View style={{ paddingHorizontal:ms(14), paddingVertical:ms(10), borderBottomWidth:1, borderColor:P.glassBorder, flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
            <Text style={{ color:P.text, fontFamily:fontHeavy }}>Who's coming</Text>
            <TouchableOpacity onPress={onClose} style={{ padding:ms(6) }}><Ionicons name="close" size={ms(16)} color={P.textMuted}/></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding:ms(12), gap:ms(10) }}>
            {rows.map((r, idx)=>(
              <View key={`${r.user_id}-${idx}`} style={{ flexDirection:"row", alignItems:"center", gap:ms(10), padding:ms(10), borderRadius:12, borderWidth:1, borderColor:P.glassBorder, backgroundColor:"rgba(255,255,255,0.03)" }}>
                <View style={{ width:ms(28), height:ms(28), borderRadius:999, overflow:"hidden", backgroundColor:"rgba(255,255,255,0.08)", alignItems:"center", justifyContent:"center" }}>
                  {r.avatar_url ? (
                    <Image source={{ uri:r.avatar_url }} style={{ width:"100%", height:"100%" }} />
                  ) : (
                    <Ionicons name="person" size={ms(16)} color={P.text} />
                  )}
                </View>
                <Text style={{ color:P.text, fontFamily:fontHeavy }}>{r.name}</Text>
                <View style={{ flex:1 }}/>
                <View style={{ flexDirection:"row", alignItems:"center", gap:ms(6) }}>
                  {r.status==="confirmed" && <Ionicons name="checkmark-circle" size={ms(16)} color="#22c55e" />}
                  {r.status==="pending"   && <Ionicons name="time"            size={ms(16)} color="#eab308" />}
                  {r.status==="busy"      && <Ionicons name="close-circle"    size={ms(16)} color="#ef4444" />}
                  <Text style={{ color:P.textMuted, fontFamily:fontSans }}>{r.status}</Text>
                </View>
              </View>
            ))}
            {!rows.length && (
              <Text style={{ color:P.textMuted, fontFamily:fontSans, textAlign:"center" }}>No responses yet.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* =========================
   Card
   ========================= */
export default function EventCardPrism({
  P, event, onVote, canEditTime, isOwner, canEditEvent, onEdit,
}: EventCardProps){
  const GREEN = "#22c55e";
  const R = ms(18);

  // entrance
  const enter = React.useRef(new Animated.Value(0)).current;
  React.useEffect(()=>{ Animated.timing(enter,{ toValue:1, duration:420, easing:Easing.out(Easing.cubic), useNativeDriver:true }).start(); },[]);
  const enterT = enter.interpolate({ inputRange:[0,1], outputRange:[ms(14),0] });

  // 3D tilt — web only
  const TILT = IS_WEB;
  const rotX = React.useRef(new Animated.Value(0)).current;
  const rotY = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(1)).current;
  const spotX = React.useRef(new Animated.Value(0)).current;
  const spotY = React.useRef(new Animated.Value(0)).current;
  const cardW = React.useRef(1), cardH = React.useRef(1);
  const maxTilt = 8;

  const onCardLayout = (e:any)=>{ cardW.current=e.nativeEvent.layout.width; cardH.current=e.nativeEvent.layout.height; };
  const toTilt = (x:number,y:number)=>{ const cx=cardW.current/2, cy=cardH.current/2; const dx=(x-cx)/cx, dy=(y-cy)/cy; rotY.setValue(-dx*maxTilt); rotX.setValue(dy*maxTilt); spotX.setValue(x-60); spotY.setValue(y-60); };
  const onCardMove = (e:any)=>{ const {locationX,locationY}=e.nativeEvent; toTilt(locationX,locationY); };
  const onCardDown = (e:any)=>{ Animated.spring(scale,{toValue:0.985,useNativeDriver:true,friction:7,tension:120}).start(); onCardMove(e); };
  const onCardUp   = ()=>{ Animated.parallel([
    Animated.spring(scale,{toValue:1,useNativeDriver:true,friction:6,tension:120}),
    Animated.timing(rotX,{toValue:0,duration:180,easing:Easing.out(Easing.quad),useNativeDriver:true}),
    Animated.timing(rotY,{toValue:0,duration:180,easing:Easing.out(Easing.quad),useNativeDriver:true}),
  ]).start(); };

  const tiltHandlers = TILT ? {
    onStartShouldSetResponder: ()=> false,
    onMoveShouldSetResponder: ()=> true,
    onResponderGrant: onCardDown,
    onResponderMove:  onCardMove,
    onResponderRelease: onCardUp,
  } : {};

  const [active, setActive] = React.useState(!!event.active);
  React.useEffect(()=> setActive(!!event.active), [event.active]);

  // realtime for active toggle from DB
  React.useEffect(()=>{
    const ch = supabase
      .channel(`event-active-${event.id}`)
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"events", filter:`id=eq.${event.id}` }, (payload)=>{
        const newActive = (payload.new as any)?.active ?? false;
        setActive(!!newActive);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [event.id]);

  const [showEditTime, setShowEditTime] = React.useState(false);
  const [showRoster, setShowRoster] = React.useState(false);

  const [dress, setDress] = React.useState(Math.min(Math.max(event.dress_code ?? 2, 0), 4));
  React.useEffect(()=> setDress(Math.min(Math.max(event.dress_code ?? 2,0),4)), [event.dress_code]);

  const heroH = IS_WEB ? 220 : (IS_SMALL ? 160 : 184);

  async function saveDress(v:number){ setDress(v); try{ await supabase.from("events").update({ dress_code:v }).eq("id",event.id); }catch{} }
  async function toggleActive(){
    try{
      if(active){
        const { error } = await supabase.rpc("deactivate_event", { p_event_id: event.id });
        if (error) throw error;
        setActive(false);
      } else {
        const { error } = await supabase.rpc("set_active_event", { p_party_id:event.party_id, p_event_id:event.id });
        if (error) throw error;
        setActive(true);
      }
    }catch(e){ console.warn("toggleActive failed", e); }
  }

  return (
    <Animated.View style={{ transform:[{ translateY:enterT }], opacity:enter }}>
      <View style={{ borderRadius:R+4, padding:1.2, overflow:"visible", marginBottom:ms(14) }}>
        <LinearGradient colors={["rgba(255,255,255,0.10)","rgba(255,255,255,0.03)"]} start={{x:0,y:0}} end={{x:1,y:1}} style={{ borderRadius:R+4, padding:1.2 }}>
          <Animated.View
            onLayout={onCardLayout}
            style={{
              borderRadius:R, overflow:"hidden", backgroundColor:P.bg2,
              borderWidth:2, borderColor:active?GREEN:P.glassBorder,
              shadowColor:active?GREEN:"transparent",
              shadowOpacity:active?0.5:0, shadowRadius:active?14:0, shadowOffset:{width:0,height:0},
              transform:[ { perspective:800 }, { rotateX: rotX.interpolate({inputRange:[-15,15],outputRange:["-15deg","15deg"]}) }, { rotateY: rotY.interpolate({inputRange:[-15,15],outputRange:["-15deg","15deg"]}) }, { scale } ],
            }}
            {...tiltHandlers}
          >
            {/* hero */}
            <Pressable>
              <ImageBackground source={event.hero_url?{uri:event.hero_url}:undefined} style={{ height:heroH }}>
                <BlurView
                  intensity={16}          // ~mild blur; bump to 20–24 if you want more
                  tint="dark"
                  pointerEvents="none"
                  style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
                />
                <LinearGradient colors={["rgba(0,0,0,0)","rgba(0,0,0,0.45)","rgba(0,0,0,0.86)"]} start={{x:0.5,y:0}} end={{x:0.5,y:1}} style={{ position:"absolute", bottom:0, left:0, right:0, height:ms(110) }}/>

                {/* overlays container */}
                <View pointerEvents="box-none" style={{ position:"absolute", inset:0 }}>
                  {/* added-by top-left */}
                  {event.added_by ? (
                    <View style={{ position:"absolute", top:ms(8), left:ms(10) }}>
                      <AddedByChip P={P} username={event.added_by}/>
                    </View>
                  ) : null}

                  {/* center: Activate, then RSVP below */}
                  <View style={{ position:"absolute", inset:0, alignItems:"center", justifyContent:"center" }}>
                    {/** Activate/Deactivate **/}
                    {isOwner ? (
                      <View style={{ paddingHorizontal:ms(6), paddingVertical:ms(4), borderRadius:999, backgroundColor:"rgba(0,0,0,0.35)", ...(IS_WEB?{ backdropFilter:"blur(6px)" }:{}) } as any}>
                        <TouchableOpacity onPress={toggleActive}
                          style={{ paddingHorizontal:ms(12), paddingVertical:ms(6), borderRadius:999, borderWidth:1,
                            borderColor: active?"#22c55eAA":"#94a3b8AA",
                            backgroundColor: active?"rgba(34,197,94,0.18)":"rgba(148,163,184,0.18)",
                            flexDirection:"row", alignItems:"center", gap:ms(6) }}>
                          <Ionicons name={active?"power":"flash"} size={ms(14)} color={active?"#22c55e":"#cbd5e1"}/>
                          <Text selectable={false} style={{ color:"#F6F9FF", fontFamily:fontHeavy, fontSize:ms(14) }}>
                            {active?"Deactivate":"Activate"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ):null}

                    {/** RSVP buttons (no counts) + roster **/}
                    {active ? (
                      <View
                        style={
                          {
                            position: "absolute",
                            top: "76%",             
                            marginTop: ms(8),
                            paddingVertical: ms(6),
                            paddingHorizontal: ms(8),        
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "transparent",
                            backgroundColor: "rgba(0,0,0,0.7)",
                            ...(IS_WEB ? { backdropFilter: "blur(6px)" } : {}),
                            width: "110%",                      
                            alignSelf: "center",               
                          } as any
                        }
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",      
                            gap: ms(8),
                          }}
                        >
                          {[
                            { key: "confirmed", label: "Confirmed", ico: "checkmark-circle" as const, col: "#22c55e" },
                            { key: "pending",   label: "Pending",   ico: "time"            as const, col: "#eab308" },
                            { key: "busy",      label: "Busy",      ico: "close-circle"    as const, col: "#ef4444" },
                          ].map(b => (
                            <TouchableOpacity
                              key={b.key}
                              onPress={async () => { try { await supabase.rpc("rsvp_set", { p_event_id: event.id, p_status: b.key }); } catch {} }}
                              style={{
                                paddingHorizontal: ms(10),
                                paddingVertical: ms(6),
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: `${b.col}55`,
                                backgroundColor: `${b.col}1A`,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: ms(6),
                              }}
                            >
                              <Ionicons name={b.ico} size={ms(14)} color={b.col} />
                              <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy, fontSize: ms(12) }}>{b.label}</Text>
                            </TouchableOpacity>
                          ))}

                          <TouchableOpacity
                            onPress={() => setShowRoster(true)}
                            style={{
                              paddingHorizontal: ms(10),
                              paddingVertical: ms(6),
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: P.glassBorder,
                              backgroundColor: "rgba(255,255,255,0.06)",
                              flexDirection: "row",
                              alignItems: "center",
                              gap: ms(6),
                            }}
                          >
                            <Ionicons name="people" size={ms(14)} color={P.text} />
                          </TouchableOpacity>
                        </View>
                      </View>

                    ):null}
                  </View>

                  {/* tilt hotspot (web only) */}
                  {TILT ? (
                    <Animated.View pointerEvents="none" style={{ position:"absolute", width:120, height:120, borderRadius:120, backgroundColor:`${P.p2}22`, transform:[{ translateX:spotX },{ translateY:spotY }], shadowColor:P.p2, shadowOpacity:0.55, shadowRadius:28, shadowOffset:{width:0,height:0} }}/>
                  ) : null}

                  {/* creator edit button (kept, small) */}
                  {canEditEvent && onEdit ? (
                    <TouchableOpacity onPress={()=>onEdit(event)} style={{ position:"absolute", right:ms(10), top:ms(10), width:ms(26), height:ms(26), borderRadius:999, alignItems:"center", justifyContent:"center", backgroundColor:"rgba(0,0,0,0.45)", borderWidth:1, borderColor:P.glassBorder }}>
                      <Ionicons name="create-outline" size={ms(14)} color="#fff"/>
                    </TouchableOpacity>
                  ):null}
                </View>
              </ImageBackground>
            </Pressable>

            {/* body */}
            <View style={{ padding:ms(12) }}>
              <Text selectable={false} style={{ color:P.text, fontSize:ms(18), fontFamily:fontHeavy, letterSpacing:0.3 }}>{event.name}</Text>
              {!!event.description && <Text selectable={false} style={{ color:P.textMuted, fontSize:ms(13), lineHeight:ms(18), marginTop:ms(6), fontFamily:fontSans }}>{event.description}</Text>}

              {(event.location_name || event.location_address) ? (
                <View style={{ flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between", marginTop:ms(6), gap:ms(8) }}>
                  <View style={{ flex:1, gap:ms(4) }}>
                    {event.location_name ? (
                      <View style={{ flexDirection:"row", alignItems:"center", gap:ms(6) }}>
                        <Ionicons name="business-outline" size={ms(14)} color={P.textMuted}/>
                        <Text selectable={false} numberOfLines={1} style={{ color:P.textMuted, fontSize:ms(12), fontFamily:fontSans, flexShrink:1 }}>{event.location_name}</Text>
                      </View>
                    ):null}
                    {event.location_address ? (
                      <View style={{ flexDirection:"row", alignItems:"center", gap:ms(6) }}>
                        <Ionicons name="location-outline" size={ms(14)} color={P.textMuted}/>
                        <Text selectable={false} numberOfLines={1} style={{ color:P.textMuted, fontSize:ms(12), fontFamily:fontSans, flexShrink:1 }}>{event.location_address}</Text>
                      </View>
                    ):null}
                  </View>
                </View>
              ):null}

              {/* Time pill (above controls) */}
              <View style={{ marginTop:ms(10), alignItems:"flex-start" }}>
                <View style={{ paddingHorizontal:ms(10), paddingVertical:ms(6), borderRadius:999, borderWidth:1, borderColor:P.glassBorder, backgroundColor:"rgba(255,255,255,0.04)", flexDirection:"row", alignItems:"center", gap:ms(8) }}>
                  <Text selectable={false} style={{ color:"#F6F9FF", fontFamily:fontHeavy, fontSize:ms(12) }}>{fmtRange(event.start_at, event.end_at)}</Text>
                  {canEditTime ? (
                    <TouchableOpacity onPress={()=>setShowEditTime(true)} style={{ padding:ms(2) }}>
                      <Ionicons name="pencil" size={ms(14)} color={P.text}/>
                    </TouchableOpacity>
                  ):null}
                </View>
              </View>

              {/* controls bar */}
              <View style={{ marginTop:ms(10), padding:ms(8), borderRadius:14, borderWidth:1, borderColor:P.glassBorder, backgroundColor:"rgba(255,255,255,0.03)", flexDirection:"row", alignItems:"center", gap:ms(10), flexWrap:"wrap" }}>
                <TouchableOpacity activeOpacity={0.92} onPress={()=>onVote(event.id, event.myVote===1?0:1)}
                  style={{ paddingHorizontal:ms(12), height:ms(34), borderRadius:999, borderWidth:1, borderColor:event.myVote===1?"#22c55eB3":P.glassBorder, backgroundColor:event.myVote===1?"rgba(34,197,94,0.12)":P.glass, flexDirection:"row", alignItems:"center", gap:ms(8) }}>
                  <View style={{ width:ms(20), height:ms(20), borderRadius:999, backgroundColor:"#22c55e", alignItems:"center", justifyContent:"center" }}>
                    <Ionicons name="thumbs-up" size={ms(13)} color="#06110a"/>
                  </View>
                  <Text selectable={false} style={{ color:P.text, fontFamily:fontHeavy, fontSize:ms(12) }}>{event.likes}</Text>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.92} onPress={()=>onVote(event.id, event.myVote===-1?0:-1)}
                  style={{ paddingHorizontal:ms(12), height:ms(34), borderRadius:999, borderWidth:1, borderColor:event.myVote===-1?"#ef4444B3":P.glassBorder, backgroundColor:event.myVote===-1?"rgba(239,68,68,0.12)":P.glass, flexDirection:"row", alignItems:"center", gap:ms(8) }}>
                  <View style={{ width:ms(20), height:ms(20), borderRadius:999, backgroundColor:"#ef4444", alignItems:"center", justifyContent:"center" }}>
                    <Ionicons name="thumbs-down" size={ms(13)} color="#160909"/>
                  </View>
                  <Text selectable={false} style={{ color:P.text, fontFamily:fontHeavy, fontSize:ms(12) }}>{event.dislikes}</Text>
                </TouchableOpacity>

                <View style={{ paddingHorizontal:ms(10), height:ms(30), borderRadius:999, borderWidth:1, borderColor:P.glassBorder, backgroundColor:P.glass, alignItems:"center", justifyContent:"center", minWidth:ms(50) }}>
                  <Text selectable={false} style={{ color:event.net>=0?"#22c55e":"#ef4444", fontFamily:fontHeavy, fontSize:ms(12), letterSpacing:0.2 }}>
                    {event.net>=0?`+${event.net}`:`${event.net}`}
                  </Text>
                </View>

                <View style={{ flexGrow:1, flexBasis:240, alignItems:"flex-end" }}>
                  <DressCodeChip P={P} value={dress} editable={!!canEditTime} onChange={saveDress}/>
                </View>
              </View>
            </View>

            {canEditTime ? (
              <TimeEditor
                P={P}
                visible={showEditTime}
                onClose={()=>setShowEditTime(false)}
                eventId={event.id}
                startISO={event.start_at ?? null}
                endISO={event.end_at ?? null}
              />
            ) : null}

            {/* Roster modal */}
            <RosterModal P={P} eventId={event.id} visible={showRoster} onClose={()=>setShowRoster(false)} />
          </Animated.View>
        </LinearGradient>
      </View>

      <LinearGradient colors={["transparent", `${P.p2}33`, "transparent"]} start={{x:0,y:0}} end={{x:1,y:0}} style={{ position:"absolute", left:ms(24), right:ms(24), bottom:-ms(10), height:ms(14), borderRadius:12, opacity:0.8 }}/>
    </Animated.View>
  );
}
