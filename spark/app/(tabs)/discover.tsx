import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  Platform,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  LayoutChangeEvent,
  GestureResponderEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import InteractiveCard from "@/components/ui/interactiveCard";


/* =========================
   THEME — palettes
   ========================= */
type Palette = {
  name: string;
  bg: string;
  bg2: string;
  text: string;
  textMuted: string;
  glass: string;
  glassBorder: string;
  p1: string; p2: string; p3: string; p4: string;
};
const PALETTES: Palette[] = [
  {
    name: "Luxe Neon",
    bg: "#070A0F",
    bg2: "#0C1120",
    text: "#ECF1FF",
    textMuted: "#B7C3DA",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.10)",
    p1: "#22D3EE", p2: "#A78BFA", p3: "#FB7185", p4: "#34D399",
  },
  {
    name: "Electric Sunset",
    bg: "#0B0814",
    bg2: "#140F2B",
    text: "#FFF5FE",
    textMuted: "#D9CBE2",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.12)",
    p1: "#F97316", p2: "#F43F5E", p3: "#8B5CF6", p4: "#06B6D4",
  },
  {
    name: "Cyber Lime",
    bg: "#060A06",
    bg2: "#0B130B",
    text: "#F1FFE9",
    textMuted: "#BCE5C0",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.10)",
    p1: "#A3E635", p2: "#22D3EE", p3: "#BEF264", p4: "#38BDF8",
  },
];

const MAX_W = 860;

/* =========================
   DATA
   ========================= */
type Suggestion = {
  id: string;
  title: string;
  desc: string;
  minutes: number;
  group: string;
  location: string;
  tags: string[];
  hero: string;
};
const SUGGESTIONS: Suggestion[] = [
  {
    id: "1",
    title: "Retro Game Night & Pizza",
    desc: "Classic arcade cabinets + wood-fired pizza.",
    minutes: 180, group: "4–8", location: "Level Up Lounge",
    tags: ["Entertainment","Retro","Arcade","Foodie","Games","Indoor"],
    hero: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920&auto=format&fit=crop",
  },
  {
    id: "2",
    title: "Mystery Picnic Adventure",
    desc: "Solve clues around the city and end with a curated picnic.",
    minutes: 150, group: "2–5", location: "Downtown",
    tags: ["Adventure","Puzzle","Outdoor","Foodie","Walking"],
    hero: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1920&auto=format&fit=crop",
  },
  {
    id: "3",
    title: "Indie Movie + Dessert Crawl",
    desc: "Catch an indie film, then hunt for the best tiramisu.",
    minutes: 140, group: "2–4", location: "Riverside",
    tags: ["Film","Foodie","Indoor","Date"],
    hero: "https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?q=80&w=1920&auto=format&fit=crop",
  },
];

/* =========================
   FILTER SOURCES
   ========================= */
const categories = [
  { key: "food", label: "Food & Drinks", img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop",
    match: ["Food","Foodie","Drink","Cafe","Pizza","Dessert","Restaurant"] },
  { key: "games", label: "Games", img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop",
    match: ["Game","Games","Retro","Arcade","Board","Bowling"] },
  { key: "outdoor", label: "Outdoors", img: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1200&auto=format&fit=crop",
    match: ["Outdoor","Hike","Park","Walking","Picnic","Trail"] },
  { key: "music", label: "Music", img: "https://images.unsplash.com/photo-1506157786151-b8491531f063?q=80&w=1200&auto=format&fit=crop",
    match: ["Music","Concert","Live","Karaoke","DJ"] },
  { key: "culture", label: "Culture", img: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=1200&auto=format&fit=crop",
    match: ["Museum","Art","Gallery","Culture","Exhibit"] },
];

const presetKeywords: Record<string, string[]> = {
  "Retro night": ["Retro","Arcade","Games"],
  "Mystery picnic": ["Picnic","Puzzle","Walking"],
  "Sports day": ["Bowling","Climb","Skate","Sport"],
  Karaoke: ["Karaoke","Music","Sing"],
  "Board games": ["Board","Game","Cafe"],
};

/* =========================
   LITTLE UI PRIMS
   ========================= */
const fontHeavy = Platform.select({ ios: "Avenir-Heavy", android: "sans-serif-condensed", default: "system-ui" });
const fontSans  = Platform.select({ ios: "Avenir-Book",  android: "sans-serif",           default: "system-ui" });

const Chip = ({ label, active, onPress, color, mr = 10 }:{
  label: string; active?: boolean; onPress?: () => void; color: string; mr?: number;
}) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.9}
    style={{
      marginRight: mr, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
      borderWidth: 1, borderColor: active ? `${color}AA` : "rgba(255,255,255,0.12)",
      backgroundColor: active ? `${color}22` : "rgba(255,255,255,0.06)",
    }}>
    <Text style={{ color: "#F8FAFF", fontSize: 12, fontFamily: fontSans, opacity: active ? 1 : 0.9 }}>{label}</Text>
  </TouchableOpacity>
);

/* =========================
   CONFETTI (no deps)
   ========================= */
type Particle = { dx:number; dy:number; r:number; rot:number; delay:number; life:number; color:string };
const makeParticles = (colors:string[], n=26): Particle[] => Array.from({length:n}).map((_,i)=>{
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

// Global confetti for pull-to-refresh
const makeGlobal = (colors:string[], n=40)=> Array.from({length:n}).map((_,i)=>{
  const angle = Math.random()*Math.PI - Math.PI/2;
  const speed = 60 + Math.random()*90;
  return {
    dx: Math.cos(angle)*speed,
    dy: -Math.abs(Math.sin(angle)*speed) - (40+Math.random()*60),
    r: 3+Math.random()*5,
    rot: Math.random()*180-90,
    delay: Math.random()*120,
    life: 700+Math.random()*600,
    color: colors[i%colors.length],
  };
});
const GlobalConfetti = ({ trigger, colors }:{ trigger:number; colors:string[] })=>{
  const parts = useMemo(()=> makeGlobal(colors), [trigger]);
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
        Animated.timing(anims[i].op,{toValue:1,duration:120,easing:Easing.out(Easing.quad),useNativeDriver:true}),
        Animated.timing(anims[i].rot,{toValue:p.rot,duration:p.life,easing:Easing.linear,useNativeDriver:true}),
      ]),
      Animated.timing(anims[i].op,{toValue:0,duration:200,easing:Easing.in(Easing.quad),useNativeDriver:true}),
    ]));
    Animated.stagger(10, seqs).start(()=>{
      anims.forEach(a=>{ a.tx.setValue(0); a.ty.setValue(0); a.op.setValue(0); a.sc.setValue(0.6); a.rot.setValue(0); });
    });
  },[trigger]); // eslint-disable-line
  return (
    <View pointerEvents="none" style={{ position:"absolute", left:0, right:0, top:0, height:260 }}>
      {parts.map((p,i)=>(
        <Animated.View key={i} style={{
          position:"absolute", top:100, left:"50%",
          opacity:anims[i].op,
          transform:[
            { translateX: Animated.add(anims[i].tx, new Animated.Value(-20)) },
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

/* =========================
   Haptics helper (optional)
   ========================= */
const haptic = (style: "light"|"medium"|"heavy" = "light")=>{
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Haptics = require("expo-haptics");
    const map:any = { light: Haptics.ImpactFeedbackStyle.Light, medium: Haptics.ImpactFeedbackStyle.Medium, heavy: Haptics.ImpactFeedbackStyle.Heavy };
    Haptics.impactAsync(map[style]);
  } catch {}
};

/* =========================
   AUTO-ACCENT (fast heuristic)
   ========================= */
const hashStr = (s:string)=>{ let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))|0; } return Math.abs(h); };
const pickAccent = (hero:string, P:Palette)=> [P.p1, P.p2, P.p3, P.p4][hashStr(hero)%4];

/* =========================
   EDGE SWIPE GLOW (left)
   ========================= */
const EdgeGlow = ({ P }:{ P:Palette })=>{
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;

  const fadeOut = ()=> Animated.timing(op,{ toValue:0, duration:220, easing:Easing.out(Easing.quad), useNativeDriver:true }).start();

  return (
    <View
      // invisible hit area along the left edge
      onStartShouldSetResponder={(e)=> e.nativeEvent.pageX < 24}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e)=>{
        y.setValue(e.nativeEvent.locationY);
        Animated.timing(op,{ toValue:1, duration:120, easing:Easing.out(Easing.quad), useNativeDriver:true }).start();
        haptic("light");
      }}
      onResponderMove={(e)=> y.setValue(e.nativeEvent.locationY)}
      onResponderRelease={fadeOut}
      style={{ position:"absolute", top:0, bottom:0, left:0, width:28, zIndex:50 }}
    >
      <Animated.View style={{ position:"absolute", left:0, width:120, height:160, opacity:op, transform:[{ translateY: y }, { translateX: -40 }] }}>
        <LinearGradient
          colors={[`${P.p2}55`, `${P.p2}22`, "transparent"]}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={{ width:"100%", height:"100%", borderTopRightRadius:80, borderBottomRightRadius:80 }}
        />
      </Animated.View>
    </View>
  );
};

/* =========================
   PREVIEW OVERLAY (long press)
   ========================= */
const PreviewOverlay = ({
  s, accent, onClose,
}:{ s: Suggestion; accent: string; onClose: ()=>void })=>{
  const op = useRef(new Animated.Value(0)).current;
  React.useEffect(()=>{
    Animated.timing(op,{ toValue:1, duration:160, easing:Easing.out(Easing.quad), useNativeDriver:true }).start();
  },[]);
  return (
    <Animated.View style={{ position:"absolute", inset:0, zIndex:60, opacity:op }}>
      <Pressable onPress={onClose} style={{ position:"absolute", inset:0 }}>
        <BlurView intensity={50} tint="dark" style={{ position:"absolute", inset:0 }} />
      </Pressable>

      <View style={{ flex:1, alignItems:"center", justifyContent:"center", padding:20 }}>
        <View style={{ width: Math.min(Dimensions.get("window").width - 40, 700), borderRadius:22, overflow:"hidden", borderWidth:1, borderColor:"rgba(255,255,255,0.12)" }}>
          <ImageBackground source={{ uri: s.hero }} style={{ height:300 }}>
            <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.8)"]} start={{x:0.5,y:0}} end={{x:0.5,y:1}} style={{ position:"absolute", inset:0 }} />
          </ImageBackground>
          <View style={{ padding:16, backgroundColor:"rgba(0,0,0,0.5)" }}>
            <Text style={{ color:"#fff", fontSize:18, fontFamily:fontHeavy }}>{s.title}</Text>
            <Text style={{ color:"rgba(255,255,255,0.85)", marginTop:6, fontFamily:fontSans }}>{s.desc}</Text>
            <View style={{ flexDirection:"row", gap:14, marginTop:8 }}>
              <Text style={{ color:"rgba(255,255,255,0.8)" }}>⏱ {s.minutes}m</Text>
              <Text style={{ color:"rgba(255,255,255,0.8)" }}>👥 {s.group}</Text>
              <Text style={{ color:"rgba(255,255,255,0.8)" }}>📍 {s.location}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:10 }}>
              {s.tags.map((t)=>(
                <View key={t} style={{ marginRight:8, paddingHorizontal:12, paddingVertical:8, borderRadius:999, backgroundColor:`${accent}33`, borderWidth:1, borderColor:`${accent}88` }}>
                  <Text style={{ color:"#fff" }}>{t}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection:"row", justifyContent:"flex-end", marginTop:12 }}>
              <TouchableOpacity onPress={onClose} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12, borderWidth:1, borderColor:`${accent}AA`, backgroundColor:`${accent}26` }}>
                <Text style={{ color:"#fff", fontFamily:fontHeavy }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

/* =========================
   PAGE
   ========================= */
export default function Discover(){
  const [palIdx, setPalIdx] = useState(0);
  const P = PALETTES[palIdx % PALETTES.length];

  const [query, setQuery] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
  const [filters, setFilters] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const [refreshing, setRefreshing] = useState(false);
  const [globalBurst, setGlobalBurst] = useState(0);

  const [preview, setPreview] = useState<Suggestion | null>(null);

  const containerW = Math.min(Dimensions.get("window").width, MAX_W);
  const toggle = (arr:string[], setArr:(v:string[])=>void, v:string) =>
    setArr(arr.includes(v) ? arr.filter((x)=>x!==v) : [...arr, v]);

  // FILTER LOGIC
  const filtered = useMemo(()=>{
    const q = query.trim().toLowerCase();
    const presetKeys = new Set<string>();
    presets.forEach((p)=> (presetKeywords[p]||[]).forEach((k)=>presetKeys.add(k.toLowerCase())));
    const catKeys = new Set<string>();
    selectedCats.forEach((key)=>{
      const cat = categories.find((c)=>c.key===key); (cat?.match||[]).forEach((k)=>catKeys.add(k.toLowerCase()));
    });

    return SUGGESTIONS.filter((s)=>{
      const hay = (s.title+" "+s.desc+" "+s.tags.join(" ")).toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (presetKeys.size) { let hit=false; for (const k of presetKeys) if (hay.includes(k)) {hit=true; break;} if(!hit) return false; }
      if (catKeys.size) { let hit=false; for (const k of catKeys) if (hay.includes(k)) {hit=true; break;} if(!hit) return false; }
      return true;
    });
  },[query,presets,selectedCats]);

  // SCROLL / AURORA
  const scrollY = useRef(new Animated.Value(0)).current;
  const HERO_H = 260;
  const heroTranslate = scrollY.interpolate({ inputRange:[-100,0,HERO_H], outputRange:[-30,0,-HERO_H*0.4], extrapolate:"clamp" });
  const heroScale = scrollY.interpolate({ inputRange:[-120,0], outputRange:[1.15,1], extrapolateRight:"clamp" });
  const aur = useRef(new Animated.Value(0)).current;
  React.useEffect(()=>{
    Animated.loop(Animated.sequence([
      Animated.timing(aur,{toValue:1,duration:9000,easing:Easing.inOut(Easing.quad),useNativeDriver:false}),
      Animated.timing(aur,{toValue:0,duration:9000,easing:Easing.inOut(Easing.quad),useNativeDriver:false}),
    ])).start();
  },[]);
  const aurShift = aur.interpolate({ inputRange:[0,1], outputRange:[0,34] });

  // pull-to-refresh -> global confetti + haptic
  const onRefresh = ()=>{
    setRefreshing(true);
    setTimeout(()=>{
      setRefreshing(false);
      setGlobalBurst(b=>b+1);
      haptic("heavy");
    }, 650);
  };

  return (
    <View style={{ flex:1, backgroundColor:P.bg }}>
      {/* Edge glow & Aurora bg */}
      <EdgeGlow P={P} />

      <View pointerEvents="none" style={{ position:"absolute", inset:0 }}>
        <Animated.View style={{ position:"absolute", top:-40, left:-80, width:360, height:360, transform:[{ translateX: aurShift as any }] }}>
          <LinearGradient colors={[`${P.p2}25`, "transparent"]} start={{x:0.1,y:0.1}} end={{x:0.8,y:0.6}} style={{ width:"100%", height:"100%", borderRadius:999 }}/>
        </Animated.View>
        <Animated.View style={{ position:"absolute", bottom:40, right:-60, width:300, height:300, transform:[{ translateX: Animated.multiply(aurShift as any, -0.7) as any }] }}>
          <LinearGradient colors={[`${P.p1}18`, "transparent"]} start={{x:0.2,y:0.2}} end={{x:0.9,y:0.8}} style={{ width:"100%", height:"100%", borderRadius:999 }}/>
        </Animated.View>
        <LinearGradient colors={[P.bg, "transparent"]} start={{x:0.5,y:0}} end={{x:0.5,y:0.5}} style={{ position:"absolute", top:0, left:0, right:0, height:360 }}/>
      </View>

      {/* global confetti */}
      <GlobalConfetti trigger={globalBurst} colors={[P.p1,P.p2,P.p3,P.p4,"#fff"]}/>

      <Animated.ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.text} />}
        onScroll={Animated.event([{ nativeEvent:{ contentOffset:{ y: scrollY } } }], { useNativeDriver:true })}
        scrollEventThrottle={16}
        contentContainerStyle={{ alignItems:"center", paddingBottom:140 }}
      >
        {/* HERO */}
        <Animated.View style={{ transform:[{ translateY: heroTranslate }, { scale: heroScale }], width:"100%" }}>
          <View style={{ width:containerW, alignSelf:"center", paddingHorizontal:20, paddingTop:70 }}>
            {/* Title + theme switch */}
            <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
              <Text style={{
                fontSize:34, color:P.p2, textShadowColor:`${P.p2}AA`, textShadowOffset:{width:0,height:0},
                textShadowRadius:16, letterSpacing:0.6, fontFamily:fontHeavy,
              }}>
                DISCOVER
              </Text>
              <TouchableOpacity
                onPress={()=>{ setPalIdx(i=>(i+1)%PALETTES.length); haptic("light"); }}
                activeOpacity={0.9}
                style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:999, borderWidth:1, borderColor:P.glassBorder, backgroundColor:P.glass }}
              >
                <Text style={{ color:P.text, fontFamily:fontSans, fontSize:12 }}>
                  {PALETTES[(palIdx+1)%PALETTES.length].name}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Context */}
            <View style={{ flexDirection:"row", alignItems:"center", marginTop:10, gap:10 }}>
              <View style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:999, backgroundColor:P.glass, borderWidth:1, borderColor:P.glassBorder }}>
                <Text style={{ color:P.textMuted, fontSize:12, fontFamily:fontSans }}>Toronto • Tonight</Text>
              </View>
            </View>

            {/* Search */}
            <BlurView intensity={40} tint="dark" style={{ borderRadius:16, marginTop:18, overflow:"hidden" }}>
              <View style={{ borderRadius:16, borderWidth:1, borderColor:P.glassBorder, paddingHorizontal:12, paddingVertical:Platform.OS==="web"?8:10, flexDirection:"row", alignItems:"center", gap:8 }}>
                <Ionicons name="search" size={16} color={P.textMuted}/>
                <TextInput value={query} onChangeText={setQuery} placeholder="What are you in the mood for?"
                  placeholderTextColor={P.textMuted} style={{ color:P.text, fontSize:15, flex:1, fontFamily:fontSans }}/>
                {query?.length?(
                  <TouchableOpacity onPress={()=>setQuery("")} style={{ padding:6 }}>
                    <Ionicons name="close" size={16} color={P.textMuted}/>
                  </TouchableOpacity>
                ):null}
              </View>
            </BlurView>

            {/* Presets */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:16 }} contentContainerStyle={{ paddingRight:24, alignItems:"center" }}>
              {["Retro night","Mystery picnic","Sports day","Karaoke","Board games"].map((label,i)=>(
                <Chip key={label} label={label} color={[P.p2,P.p1,P.p4,P.p3,P.p2][i%5]} active={presets.includes(label)} onPress={()=>toggle(presets,setPresets,label)}/>
              ))}
            </ScrollView>
          </View>
        </Animated.View>

        {/* Categories */}
        <View style={{ width:containerW, paddingHorizontal:20, marginTop:18 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight:24 }}>
            {categories.map((c,i)=>{
              const on = selectedCats.includes(c.key);
              const col = [P.p1,P.p2,P.p3,P.p4,P.p1][i%5];
              return (
                <TouchableOpacity key={c.key} onPress={()=>toggle(selectedCats,setSelectedCats,c.key)} activeOpacity={0.9}
                  style={{
                    width:172, height:98, borderRadius:18, overflow:"hidden", marginRight:i===categories.length-1?0:12,
                    borderWidth:1, borderColor:on?`${col}AA`:P.glassBorder, backgroundColor:P.bg2,
                  }}>
                  <ImageBackground source={{ uri: c.img }} style={{ flex:1 }}>
                    <LinearGradient colors={[`${col}66`,"transparent"]} start={{x:0,y:0}} end={{x:1,y:0}}
                      style={{ position:"absolute", top:0, left:0, right:0, height:6 }}/>
                    <LinearGradient colors={["rgba(0,0,0,0)", on?`${col}22`:"rgba(0,0,0,0.85)"]} start={{x:0.5,y:0}} end={{x:0.5,y:1}}
                      style={{ position:"absolute", bottom:0, left:0, right:0, height:72 }}/>
                    <View style={{ position:"absolute", bottom:10, left:10, right:10 }}>
                      <Text style={{ color:"#F8FAFF", fontFamily:fontHeavy, fontSize:13 }} numberOfLines={1}>{c.label}</Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Beam */}
        <View style={{ width:containerW, paddingHorizontal:20, marginTop:20, marginBottom:6 }}>
          <LinearGradient colors={[`${P.p2}00`, `${P.p2}66`, `${P.p2}00`]} start={{x:0,y:0.5}} end={{x:1,y:0.5}} style={{ height:1.2, borderRadius:999 }}/>
        </View>

        {/* Sort/Distance */}
        <View style={{ width:containerW, paddingHorizontal:20 }}>
          <BlurView intensity={28} tint="dark" style={{ borderRadius:16, overflow:"hidden" }}>
            <View style={{ padding:10, flexDirection:"row", gap:10, flexWrap:"wrap" }}>
              {selectedCats.map((key)=>{
                const col=P.p1; const c=categories.find((x)=>x.key===key)!;
                return <Chip key={key} label={c.label} color={col} active onPress={()=>toggle(selectedCats,setSelectedCats,key)}/>;
              })}
              {["Trending","Nearby","New"].map((s,i)=>(
                <Chip key={s} label={s} color={[P.p4,P.p1,P.p3][i]} active={filters.includes(s)} onPress={()=>toggle(filters,setFilters,s)}/>
              ))}
              {["<5km","<10km","<25km"].map((d,i)=>(
                <Chip key={d} label={d} color={[P.p2,P.p3,P.p4][i]} active={filters.includes(d)} onPress={()=>toggle(filters,setFilters,d)}/>
              ))}
              {!!selectedCats.length && (
                <TouchableOpacity onPress={()=>setSelectedCats([])}
                  style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:999, borderWidth:1, borderColor:P.glassBorder, backgroundColor:"rgba(255,255,255,0.05)" }}>
                  <Text style={{ color:P.textMuted, fontSize:12, fontFamily:fontSans }}>Clear categories</Text>
                </TouchableOpacity>
              )}
            </View>
          </BlurView>
        </View>

        {/* Cards */}
        <View style={{ width:containerW, paddingHorizontal:20, marginTop:18 }}>
          {filtered.length ? (
            filtered.map((item,i)=>(
              <InteractiveCard
                key={item.id}
                s={item}
                P={P}
                idx={i}
                saved={!!saved[item.id]}
                onSave={()=> setSaved(p=>({ ...p, [item.id]: !p[item.id] }))}
                onPreview={(s)=> setPreview(s)}
              />
            ))
          ) : (
            <View style={{ paddingVertical:80, alignItems:"center" }}>
              <Text style={{ color:P.textMuted, fontFamily:fontSans }}>No ideas—try different filters.</Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Long-press preview overlay */}
      {preview ? (
        <PreviewOverlay
          s={preview}
          accent={pickAccent(preview.hero, P)}
          onClose={()=> setPreview(null)}
        />
      ) : null}
    </View>
  );
}
