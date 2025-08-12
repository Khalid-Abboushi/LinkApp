import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ImageBackground,
  Dimensions,
  Platform,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  LayoutChangeEvent,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { fetchMyParties } from "@/data/parties";
import CreatePartyModal, { CreatePartyPayload } from "@/components/CreatePartyModal";
import { createPartyWithImage } from "@/data/parties";
import { uploadImageToPartyPics } from "@/data/uploadImage";


/* ========= Shared look & feel (matching Discover) ========= */
type Palette = {
  name: string; bg: string; bg2: string; text: string; textMuted: string; glass: string; glassBorder: string;
  p1: string; p2: string; p3: string; p4: string;
};
const PALETTES: Palette[] = [
  { name:"Luxe Neon", bg:"#070A0F", bg2:"#0C1120", text:"#ECF1FF", textMuted:"#B7C3DA",
    glass:"rgba(255,255,255,0.06)", glassBorder:"rgba(255,255,255,0.10)",
    p1:"#22D3EE", p2:"#A78BFA", p3:"#FB7185", p4:"#34D399" },
  { name:"Electric Sunset", bg:"#0B0814", bg2:"#140F2B", text:"#FFF5FE", textMuted:"#D9CBE2",
    glass:"rgba(255,255,255,0.06)", glassBorder:"rgba(255,255,255,0.12)",
    p1:"#F97316", p2:"#F43F5E", p3:"#8B5CF6", p4:"#06B6D4" },
  { name:"Cyber Lime", bg:"#060A06", bg2:"#0B130B", text:"#F1FFE9", textMuted:"#BCE5C0",
    glass:"rgba(255,255,255,0.06)", glassBorder:"rgba(255,255,255,0.10)",
    p1:"#A3E635", p2:"#22D3EE", p3:"#BEF264", p4:"#38BDF8" },
];
const fontHeavy = Platform.select({ ios:"Avenir-Heavy", android:"sans-serif-condensed", default:"system-ui" });
const fontSans  = Platform.select({ ios:"Avenir-Book",  android:"sans-serif",           default:"system-ui" });
const MAX_W = 860;

/* ========= Types used by this UI ========= */

type MemberRole = "owner" | "admin" | "member";
type Member = { id: string; displayName: string; avatarUrl?: string; role: MemberRole; };
type PartyTab = "details" | "chat" | "events" | "polls" | "gallery";
type Money = { currency: "USD"|"CAD"|"EUR"|"GBP"; amount: number; };
type CostType = "per_person" | "total";
type RSVPStatus = "draft" | "open" | "closed" | "completed";

export class Event {
  id: string;
  name: string;
  description?: string;
  location?: { name: string; address?: string; lat?: number; lng?: number; url?: string; };
  startAt?: string;
  endAt?: string;
  tags: string[];
  cost?: Money;
  costType?: CostType;
  maxGroupSize?: number;
  minGroupSize?: number;
  organizerId?: string;
  images?: string[];
  rsvpStatus: RSVPStatus;
  votePollId?: string;
  notes?: string;

  constructor(init: Partial<Event>) {
    this.id = init.id ?? `evt_${Math.random().toString(36).slice(2, 8)}`;
    this.name = init.name ?? "Untitled Event";
    this.description = init.description;
    this.location = init.location;
    this.startAt = init.startAt;
    this.endAt = init.endAt;
    this.tags = init.tags ?? [];
    this.cost = init.cost;
    this.costType = init.costType ?? "per_person";
    this.maxGroupSize = init.maxGroupSize;
    this.minGroupSize = init.minGroupSize;
    this.organizerId = init.organizerId;
    this.images = init.images ?? [];
    this.rsvpStatus = init.rsvpStatus ?? "draft";
    this.votePollId = init.votePollId;
    this.notes = init.notes;
  }
}

type UIParty = {
  id: string;
  name: string;
  pictureUrl?: string;
  members: Member[];      // we fill with a short preview
  tabs: PartyTab[];
  chatId: string;
  events: Event[];        // mapped from API events
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
};

/* ========= Helpers ========= */

const hashStr = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const pickAccent = (seed: string, P: Palette) => [P.p1, P.p2, P.p3, P.p4][hashStr(seed) % 4];

function useRealtimeAuthBridge() {
  useEffect(() => {
    // set initial token
    supabase.auth.getSession().then(({ data }) => {
      supabase.realtime.setAuth(data.session?.access_token ?? "");
    });

    // keep token fresh
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? "");
    });

    return () => sub.subscription.unsubscribe();
  }, []);
}



function getNextEvent(party: UIParty): Event | undefined {
  const now = Date.now();
  const upcoming = party.events
    .filter((e) => (e.startAt ? Date.parse(e.startAt) >= now : false))
    .sort((a, b) => Date.parse(a.startAt!) - Date.parse(b.startAt!));
  return upcoming[0];
}

/* ========= Edge glow (left) ========= */
const EdgeGlow = ({ P }: { P: Palette }) => {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const fadeOut = () =>
    Animated.timing(op, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();

  return (
    <View
      onStartShouldSetResponder={(e) => e.nativeEvent.pageX < 24}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        y.setValue(e.nativeEvent.locationY);
        Animated.timing(op, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      }}
      onResponderMove={(e) => y.setValue(e.nativeEvent.locationY)}
      onResponderRelease={fadeOut}
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 28, zIndex: 5 }}
    >
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          width: '92%',
          height: 160,
          opacity: op,
          transform: [{ translateY: y }, { translateX: -40 }],
        }}
      >
        <LinearGradient
          colors={["#A78BFA55", "#A78BFA22", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ width: "92%", height: "100%", borderTopRightRadius: 80, borderBottomRightRadius: 80 }}
        />
      </Animated.View>
    </View>
  );
};

/* ========= Local confetti for the “New Party” CTA ========= */
type Particle = { dx:number; dy:number; r:number; rot:number; delay:number; life:number; color:string };
const makeParticles = (colors:string[], n=26): Particle[] =>
  Array.from({length:n}).map((_,i)=>{
    const angle = Math.random()*Math.PI - Math.PI/2;
    const speed = 52 + Math.random()*80;
    return {
      dx: Math.cos(angle)*speed,
      dy: -Math.abs(Math.sin(angle)*speed) - (36+Math.random()*56),
      r: 3+Math.random()*5,
      rot: Math.random()*180-90,
      delay: Math.random()*90,
      life: 640+Math.random()*520,
      color: colors[i%colors.length],
    };
  });

const LocalConfetti = ({ trigger, colors, origin }:{
  trigger:number; colors:string[]; origin:{ x:number; y:number };
})=>{
  const parts = useMemo(()=> makeParticles(colors), [trigger]);
  const anims = useRef(parts.map(()=>({
    tx:new Animated.Value(0), ty:new Animated.Value(0), op:new Animated.Value(0), sc:new Animated.Value(0.6), rot:new Animated.Value(0),
  }))).current;
  React.useEffect(()=>{
    if(!trigger) return;
    const seqs = parts.map((p,i)=> Animated.sequence([
      Animated.delay(p.delay),
      Animated.parallel([
        Animated.timing(anims[i].tx,{toValue:p.dx,duration:p.life,easing:Easing.out(Easing.quad),useNativeDriver:true}),
        Animated.timing(anims[i].ty,{toValue:p.dy,duration:p.life,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
        Animated.timing(anims[i].sc,{toValue:1+Math.random()*0.6,duration:p.life,easing:Easing.out(Easing.quad),useNativeDriver:true}),
        Animated.timing(anims[i].op,{toValue:1,duration:110,easing:Easing.out(Easing.quad),useNativeDriver:true}),
        Animated.timing(anims[i].rot,{toValue:p.rot,duration:p.life,easing:Easing.linear,useNativeDriver:true}),
      ]),
      Animated.timing(anims[i].op,{toValue:0,duration:200,easing:Easing.in(Easing.quad),useNativeDriver:true}),
    ]));
    Animated.stagger(10, seqs).start(()=>{
      anims.forEach(a=>{ a.tx.setValue(0); a.ty.setValue(0); a.op.setValue(0); a.sc.setValue(0.6); a.rot.setValue(0); });
    });
  },[trigger]); // eslint-disable-line
  return (
    <View pointerEvents="none" style={{ position:"absolute", inset:0 }}>
      {parts.map((p,i)=>(
        <Animated.View key={i} style={{
          position:"absolute", left:origin.x, top:origin.y, opacity:anims[i].op,
          transform:[
            { translateX: anims[i].tx },
            { translateY: anims[i].ty },
            { scale: anims[i].sc },
            { rotate: anims[i].rot.interpolate({inputRange:[-180,180],outputRange:["-180deg","180deg"]})},
          ],
        }}>
          <View style={{ width:p.r*2, height:p.r*2, borderRadius:999, backgroundColor:p.color }}/>
        </Animated.View>
      ))}
    </View>
  );
};

/* ========= Members preview loader ========= */

type MembersPreview = { members: Member[]; count: number };
async function fetchMembersPreview(partyId: string, limit = 5): Promise<MembersPreview> {
  // Adjust column names if your schema differs.
  const { data, error, count } = await supabase
    .from("party_members")
    .select("role, profiles:profile_id(id, display_name, avatar_url)", { count: "exact" })
    .eq("party_id", partyId)
    .limit(limit);

  if (error) {
    console.warn("members preview error", error);
    return { members: [], count: 0 };
  }

  const members: Member[] =
    (data ?? []).map((row: any) => ({
      id: row.profiles?.id ?? "",
      displayName: row.profiles?.display_name ?? "Member",
      avatarUrl: row.profiles?.avatar_url ?? undefined,
      role: (row.role ?? "member") as MemberRole,
    }));

  return { members, count: count ?? members.length };
}

/* ========= Party row (tilt, glow, glass) ========= */

const PartyRow = ({ item, P, idx, onPress }:{
  item: UIParty; P: Palette; idx: number; onPress: ()=>void;
})=>{
  const accent = pickAccent(item.pictureUrl || item.id, P);

  // entrance
  const enter = useRef(new Animated.Value(0)).current;
  React.useEffect(()=>{
    Animated.sequence([ Animated.delay(idx*70), Animated.timing(enter,{toValue:1,duration:420,easing:Easing.out(Easing.cubic),useNativeDriver:true}) ]).start();
  },[]); // eslint-disable-line
  const enterT = enter.interpolate({ inputRange:[0,1], outputRange:[16,0] });

  // tilt & scale
  const rotX = useRef(new Animated.Value(0)).current;
  const rotY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const cardW = useRef(1); const cardH = useRef(1);
  const maxTilt = 6;

  const onLayout = (e:LayoutChangeEvent)=>{ cardW.current = e.nativeEvent.layout.width; cardH.current = e.nativeEvent.layout.height; };
  const toTilt = (x:number,y:number)=>{
    const cx = cardW.current/2, cy = cardH.current/2;
    const dx = (x - cx) / cx; const dy = (y - cy) / cy;
    rotY.setValue(-dx * maxTilt);
    rotX.setValue(dy * maxTilt);
  };
  const onMove = (e:any)=>{ const {locationX, locationY} = e.nativeEvent; toTilt(locationX, locationY); };
  const onDown = (e:any)=>{ Animated.spring(scale,{toValue:0.985,useNativeDriver:true,friction:7,tension:120}).start(); onMove(e); };
  const onUp = ()=>{ Animated.parallel([
    Animated.spring(scale,{toValue:1,useNativeDriver:true,friction:6,tension:120}),
    Animated.timing(rotX,{toValue:0,duration:160,easing:Easing.out(Easing.quad),useNativeDriver:true}),
    Animated.timing(rotY,{toValue:0,duration:160,easing:Easing.out(Easing.quad),useNativeDriver:true}),
  ]).start(); };

  const next = getNextEvent(item);

  return (
    <Animated.View style={{ transform:[{ translateY: enterT }], opacity: enter }}>
      <View style={{ borderRadius:22, padding:1.2, overflow:"hidden", marginBottom:14 }}>
        <LinearGradient colors={["rgba(255,255,255,0.06)","rgba(255,255,255,0.02)"]} start={{x:0,y:0}} end={{x:1,y:1}} style={{ borderRadius:22, padding:1.2 }}>
          <Animated.View
            onLayout={onLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onDown}
            onResponderMove={onMove}
            onResponderRelease={onUp}
            style={{
              borderRadius:20, overflow:"hidden", backgroundColor:P.bg2,
              borderWidth:1, borderColor:P.glassBorder,
              transform:[
                { perspective: 800 },
                { rotateX: rotX.interpolate({inputRange:[-15,15],outputRange:["-15deg","15deg"]}) },
                { rotateY: rotY.interpolate({inputRange:[-15,15],outputRange:["-15deg","15deg"]}) },
                { scale },
              ],
            }}
          >
            <Pressable onPress={onPress}>
              {/* header image or gradient strip */}
              {item.pictureUrl ? (
                <ImageBackground source={{ uri: item.pictureUrl }} style={{ height:120 }}>
                  <LinearGradient
                    colors={[`${accent}85`,"transparent"]}
                    start={{x:0,y:0}} end={{x:1,y:0}}
                    style={{ position:"absolute", top:0, left:0, right:0, height:6 }}
                  />
                  <LinearGradient
                    colors={["rgba(0,0,0,0)","rgba(0,0,0,0.75)"]}
                    start={{x:0.5,y:0}} end={{x:0.5,y:1}}
                    style={{ position:"absolute", bottom:0, left:0, right:0, height:70 }}
                  />
                </ImageBackground>
              ) : (
                <LinearGradient
                  colors={[`${accent}22`, "transparent"]}
                  start={{x:0,y:0}} end={{x:1,y:0}}
                  style={{ height:10 }}
                />
              )}

              {/* content */}
              <View style={{ padding:14, flexDirection:"row", alignItems:"center", gap:12 }}>
                {/* avatar stack (first 3 members) */}
                <View style={{ width:54, alignItems:"center" }}>
                  <View style={{ flexDirection:"row" }}>
                    {item.members.slice(0,3).map((m, i)=>(
                      <Image
                        key={m.id}
                        source={{ uri: m.avatarUrl || "https://placehold.co/40x40/png" }}
                        style={{ width:26, height:26, borderRadius:999, borderWidth:1, borderColor:P.glassBorder, marginLeft:i? -8 : 0 }}
                      />
                    ))}
                  </View>
                </View>

                {/* text */}
                <View style={{ flex:1 }}>
                  <Text numberOfLines={1} style={{ color:P.text, fontSize:16, fontFamily:fontHeavy, letterSpacing:0.2 }}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color:P.textMuted, marginTop:2, fontSize:12, fontFamily:fontSans }}>
                    {next ? `Next: ${next.name}${next.startAt ? " • " + new Date(next.startAt).toLocaleString() : ""}` : "No upcoming event"}
                  </Text>
                </View>

                {/* unread */}
                {item.unreadCount ? (
                  <View
                    style={{
                      minWidth: 24, paddingHorizontal: 7, height: 24, borderRadius: 12,
                      backgroundColor: accent, alignItems: "center", justifyContent: "center",
                      shadowColor: accent, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset:{ width:0, height:2 },
                    }}
                  >
                    <Text style={{ color:"#081018", fontWeight:"800", fontSize:12, fontFamily:fontHeavy }}>
                      {item.unreadCount}
                    </Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={P.textMuted} />
                )}
              </View>
            </Pressable>
          </Animated.View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
};

/* ========= Page (now uses real data) ========= */

export default function PartiesList() {
  useRealtimeAuthBridge();
  const router = useRouter();
  const [palIdx, setPalIdx] = useState(0);
  const P = PALETTES[palIdx % PALETTES.length];
  const containerW = Math.min(Dimensions.get("window").width, MAX_W);

  const [refreshing, setRefreshing] = useState(false);
  const [burst, setBurst] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<UIParty[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Aurora background anim
  const aur = useRef(new Animated.Value(0)).current;
  React.useEffect(()=>{
    Animated.loop(Animated.sequence([
      Animated.timing(aur,{toValue:1,duration:9000,easing:Easing.inOut(Easing.quad),useNativeDriver:false}),
      Animated.timing(aur,{toValue:0,duration:9000,easing:Easing.inOut(Easing.quad),useNativeDriver:false}),
    ])).start();
  },[]);
  const aurShift = aur.interpolate({ inputRange:[0,1], outputRange:[0,34] });

  // CTA confetti origin
  const ctaBox = useRef({ x:0, y:0, w:0, h:0 });
  const onCtaLayout = (e:LayoutChangeEvent)=>{
    const { x, y, width, height } = e.nativeEvent.layout;
    ctaBox.current = { x, y, w: width, h: height };
  };

  const mapApiToUI = (api: Awaited<ReturnType<typeof fetchMyParties>>[number]): UIParty => {
    return {
      id: api.id,
      name: api.name,
      pictureUrl: api.picture_url ?? undefined,
      members: [],  // fill with preview next
      tabs: ["details", "chat", "events", "polls"],
      chatId: api.id,
      events: (api.events ?? []).map(
        (e) => new Event({ id: e.id, name: e.name, startAt: e.start_at ?? undefined })
      ),
      createdAt: api.created_at,
      updatedAt: api.updated_at,
      unreadCount: 0,
    };
  };

  const load = async () => {
    try {
      setError(null);
      setLoading(true);

      const parties = await fetchMyParties();
      const uiParties = parties.map(mapApiToUI);

      // fetch member previews in parallel
      const previews = await Promise.all(
        uiParties.map((p) => fetchMembersPreview(p.id))
      );

      previews.forEach((pv, i) => {
        uiParties[i].members = pv.members;
      });

      setList(uiParties);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to load parties");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const onRefresh = async ()=>{
    setRefreshing(true);
    await load();
    setRefreshing(false);
    setBurst(b=>b+1); // little delight
  };

  return (
    <View style={{ flex:1, backgroundColor:P.bg }}>
      <EdgeGlow P={P} />

      {/* Aurora background */}
      <View pointerEvents="none" style={{ position:"absolute", inset:0 }}>
        <Animated.View style={{ position:"absolute", top:-40, left:-80, width:360, height:360, transform:[{ translateX: aurShift as any }] }}>
          <LinearGradient colors={[`${P.p2}25`, "transparent"]} start={{x:0.1,y:0.1}} end={{x:0.8,y:0.6}} style={{ width:"100%", height:"100%", borderRadius:999 }}/>
        </Animated.View>
        <Animated.View style={{ position:"absolute", bottom:40, right:-60, width:300, height:300, transform:[{ translateX: Animated.multiply(aurShift as any, -0.7) as any }] }}>
          <LinearGradient colors={[`${P.p1}18`, "transparent"]} start={{x:0.2,y:0.2}} end={{x:0.9,y:0.8}} style={{ width:"100%", height:"100%", borderRadius:999 }}/>
        </Animated.View>
        <LinearGradient colors={[P.bg, "transparent"]} start={{x:0.5,y:0}} end={{x:0.5,y:0.5}} style={{ position:"absolute", top:0, left:0, right:0, height:260 }}/>
      </View>

      {loading ? (
        <View style={{ flex:1, alignItems:"center", justifyContent:"center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop:8, color:"#98A2B3" }}>Loading your parties…</Text>
        </View>
      ) : error ? (
        <View style={{ flex:1, alignItems:"center", justifyContent:"center", padding:24 }}>
          <Text style={{ color:"#B42318", fontWeight:"700", marginBottom:6 }}>Something went wrong</Text>
          <Text style={{ color:"#98A2B3", textAlign:"center" }}>{error}</Text>
          <TouchableOpacity style={{ marginTop:12 }} onPress={load}>
            <Text style={{ color:"#60A5FA", fontWeight:"700" }}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(x) => x.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.text} />}
          contentContainerStyle={{ alignItems:"center", paddingHorizontal:20, paddingBottom:140, paddingTop:70 }}
          ListHeaderComponent={
            <View style={{ width:Math.min(Dimensions.get("window").width, MAX_W)-20, alignSelf:"center", marginBottom:12 }}>
              {/* Title + palette switch */}
              <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
                <Text style={{
                  fontSize:34, color:P.p2, textShadowColor:`${P.p2}AA`, textShadowOffset:{width:0,height:0},
                  textShadowRadius:16, letterSpacing:0.6, fontFamily:fontHeavy,
                }}>
                  PARTIES
                </Text>

                <TouchableOpacity
                  onPress={()=> setPalIdx(i=> (i+1) % PALETTES.length)}
                  activeOpacity={0.9}
                  style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:999, borderWidth:1, borderColor:P.glassBorder, backgroundColor:P.glass }}
                >
                  <Text style={{ color:P.text, fontFamily:fontSans, fontSize:12 }}>
                    {PALETTES[(palIdx+1)%PALETTES.length].name}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Context bar */}
              <View style={{ flexDirection:"row", alignItems:"center", marginTop:10, gap:10 }}>
                <View style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:999, backgroundColor:P.glass, borderWidth:1, borderColor:P.glassBorder }}>
                  <Text style={{ color:P.textMuted, fontSize:12, fontFamily:fontSans }}>Your groups</Text>
                </View>
                <Text style={{ fontSize:14, color:P.textMuted, fontFamily:fontSans }}>Tap a party to open the room</Text>
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={{ width:Math.min(Dimensions.get("window").width, MAX_W)-20 }}>
              <PartyRow
                item={item}
                idx={index}
                P={P}
                onPress={()=> router.push(`/(tabs)/parties/${item.id}`)}
              />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
          ListEmptyComponent={
            <View style={{ paddingTop:64 }}>
              <Text style={{ color:"#98A2B3" }}>You’re not in any parties yet.</Text>
            </View>
          }
        />
      )}

      {/* Floating New Party CTA */}
      <View style={{ position:"absolute", left:0, right:0, bottom:26, alignItems:"center" }}>
        <View style={{ width:Math.min(Dimensions.get("window").width, MAX_W), paddingHorizontal:20, alignSelf:"center" }}>
          <View style={{ alignItems:"flex-end" }}>
            <Animated.View onLayout={(e)=> {
              const { x, y, width, height } = e.nativeEvent.layout;
              (ctaBox as any).current = { x, y, w: width, h: height };
            }} style={{ position:"relative" }}>
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => setShowCreate(true)}
                style={{
                  paddingHorizontal:18, paddingVertical:14, borderRadius:14, overflow:"hidden",
                  borderWidth:1, borderColor:`${P.p1}AA`, backgroundColor: P.p1,
                  shadowColor: P.p1, shadowOpacity:0.35, shadowRadius:12, shadowOffset:{ width:0, height:4 },
                  flexDirection:"row", alignItems:"center", gap:8,
                }}
              >
                <Ionicons name="add" size={18} color={PALETTES[palIdx].text}/>
                <Text style={{ color:"#F6F9FF", fontFamily:fontHeavy, letterSpacing:0.2 }}>New party</Text>
              </TouchableOpacity>

              {/* Confetti from CTA center */}
              <LocalConfetti
                trigger={burst}
                colors={[P.p1, P.p2, P.p3, P.p4, "#fff"]}
                origin={{ x: (ctaBox.current.w/2) || 0, y: (ctaBox.current.h/2) || 0 }}
              />
              <CreatePartyModal
                visible={showCreate}
                onClose={() => setShowCreate(false)}
                onSubmit={async ({ name, image }: CreatePartyPayload) => {
                  const created = await createPartyWithImage(name, image as any);
                  console.log("created party:", created);
                  await load();         
                  setShowCreate(false);  
                }}
              />
            </Animated.View>
          </View>
        </View>
      </View>
    </View>
  );
}
