// components/ui/InteractiveCard.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ImageBackground,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Animated,
  Easing,
  LayoutChangeEvent,
  GestureResponderEvent,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AddToPartyDialog from "@/components/ui/AddToPartyDialog";

/* =============== Local types (structural; no imports needed) =============== */
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

/* ===== Helpers ===== */
const haptic = (style: "light"|"medium"|"heavy" = "light")=>{
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Haptics = require("expo-haptics");
    const map:any = { light: Haptics.ImpactFeedbackStyle.Light, medium: Haptics.ImpactFeedbackStyle.Medium, heavy: Haptics.ImpactFeedbackStyle.Heavy };
    Haptics.impactAsync(map[style]);
  } catch {}
};
const hashStr = (s:string)=>{ let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))|0; } return Math.abs(h); };
const pickAccent = (hero:string, P:Palette)=> [P.p1, P.p2, P.p3, P.p4][hashStr(hero)%4];

/* ===== Local (no-deps) confetti ===== */
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

/* ===== Web-only “no select/drag” style ===== */
const NO_SELECT: any = Platform.OS === "web"
  ? { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitUserDrag: "none", cursor: "default" }
  : null;

/* =========================
   Exported Interactive Card
   ========================= */
export default function InteractiveCard({
  s, P, idx, onSave, saved, onPreview,
}:{
  s: Suggestion; P: Palette; idx:number; onSave: () => void; saved:boolean; onPreview: (s:Suggestion)=>void;
}){
  const accent = pickAccent(s.hero, P);

  // entrance
  const enter = useRef(new Animated.Value(0)).current;
  React.useEffect(()=>{
    Animated.sequence([ Animated.delay(idx*70), Animated.timing(enter,{toValue:1,duration:420,easing:Easing.out(Easing.cubic),useNativeDriver:true}) ]).start();
  },[]); // eslint-disable-line
  const enterT = enter.interpolate({ inputRange:[0,1], outputRange:[16,0] });

  // tilt + hotspot
  const rotX = useRef(new Animated.Value(0)).current;
  const rotY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const spotX = useRef(new Animated.Value(0)).current;
  const spotY = useRef(new Animated.Value(0)).current;
  const cardW = useRef(1); const cardH = useRef(1);
  const maxTilt = 8;

  const onCardLayout = (e:LayoutChangeEvent)=>{ cardW.current = e.nativeEvent.layout.width; cardH.current = e.nativeEvent.layout.height; };
  const toTilt = (x:number,y:number)=>{
    const cx = cardW.current/2, cy = cardH.current/2;
    const dx = (x - cx) / cx; const dy = (y - cy) / cy;
    rotY.setValue(-dx * maxTilt);
    rotX.setValue(dy * maxTilt);
    spotX.setValue(x - 60);
    spotY.setValue(y - 60);
  };
  const onCardMove = (e:GestureResponderEvent)=>{ const {locationX, locationY} = e.nativeEvent; toTilt(locationX, locationY); pullCTA(locationX, locationY); };
  const onCardDown = (e:GestureResponderEvent)=>{ haptic("light"); Animated.spring(scale,{toValue:0.985,useNativeDriver:true,friction:7,tension:120}).start(); onCardMove(e); };
  const onCardUp = ()=>{ Animated.parallel([
    Animated.spring(scale,{toValue:1,useNativeDriver:true,friction:6,tension:120}),
    Animated.timing(rotX,{toValue:0,duration:180,easing:Easing.out(Easing.quad),useNativeDriver:true}),
    Animated.timing(rotY,{toValue:0,duration:180,easing:Easing.out(Easing.quad),useNativeDriver:true}),
  ]).start(); };

  // magnetic CTA + confetti origin
  const ctaTx = useRef(new Animated.Value(0)).current;
  const ctaTy = useRef(new Animated.Value(0)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;
  const ctaBox = useRef({ x:0, y:0, w:0, h:0 });

  const onCtaLayout = (e:LayoutChangeEvent)=>{
    const { x, y, width, height } = e.nativeEvent.layout;
    ctaBox.current = { x, y, w: width, h: height };
  };
  const pullCTA = (x:number,y:number)=>{
    const { x:bx, y:by, w, h } = ctaBox.current;
    const cx = bx + w/2, cy = by + h/2;
    const dx = x - cx, dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const within = dist < 140;
    const factor = within ? 0.12 : 0;
    Animated.spring(ctaTx,{ toValue: dx*factor, useNativeDriver:true, friction:7, tension:120 }).start();
    Animated.spring(ctaTy,{ toValue: dy*factor, useNativeDriver:true, friction:7, tension:120 }).start();
    Animated.spring(ctaScale,{ toValue: within?1.06:1, useNativeDriver:true, friction:7, tension:120 }).start();
  };

  // ripple + confetti
  const rippleS = useRef(new Animated.Value(0)).current;
  const rippleO = useRef(new Animated.Value(0)).current;
  const triggerRipple = ()=>{
    rippleS.setValue(0); rippleO.setValue(0.35);
    Animated.parallel([
      Animated.timing(rippleS,{toValue:1,duration:520,easing:Easing.out(Easing.quad),useNativeDriver:true}),
      Animated.timing(rippleO,{toValue:0,duration:520,easing:Easing.inOut(Easing.quad),useNativeDriver:true}),
    ]).start();
  };
  const [burst, setBurst] = useState(0);
  const [showDialog, setShowDialog] = useState(false);

  return (
    <Animated.View style={{ marginBottom:26, transform:[{ translateY: enterT }], opacity: enter }}>
      <View style={{ borderRadius:22, padding:1.2, overflow:"hidden" }}>
        <LinearGradient colors={["rgba(255,255,255,0.06)","rgba(255,255,255,0.02)"]} start={{x:0,y:0}} end={{x:1,y:1}} style={{ borderRadius:22, padding:1.2 }}>
          <Animated.View
            onLayout={onCardLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onCardDown}
            onResponderMove={onCardMove}
            onResponderRelease={onCardUp}
            style={{
              borderRadius:20,
              overflow:"hidden",
              backgroundColor:P.bg2,
              borderWidth:1,
              borderColor:P.glassBorder,
              ...(NO_SELECT || {}),         // ⬅️ prevent selection/drag on web
              transform:[
                { perspective: 800 },
                { rotateX: rotX.interpolate({inputRange:[-15,15],outputRange:["-15deg","15deg"]}) as any },
                { rotateY: rotY.interpolate({inputRange:[-15,15],outputRange:["-15deg","15deg"]}) as any },
                { scale },
              ],
            } as any}
          >
            {/* hero (long press to preview) */}
            <Pressable onLongPress={()=>{ haptic("medium"); onPreview(s); }}>
              <ImageBackground source={{ uri: s.hero }} style={{ height:220 }}>
                <View style={{ position:"absolute", top:14, left:-60, transform:[{ rotate:"-18deg" }] }}>
                  <LinearGradient colors={[accent, `${accent}66`]} start={{x:0,y:0}} end={{x:1,y:0}}
                    style={{ width:180, height:10, borderRadius:999 }} />
                </View>
                <LinearGradient colors={[`${accent}85`,"transparent"]} start={{x:0,y:0}} end={{x:1,y:0}}
                  style={{ position:"absolute", top:0, left:0, right:0, height:8 }} />
                <LinearGradient colors={["rgba(0,0,0,0)","rgba(0,0,0,0.45)","rgba(0,0,0,0.86)"]}
                  start={{x:0.5,y:0}} end={{x:0.5,y:1}}
                  style={{ position:"absolute", bottom:0, left:0, right:0, height:140 }} />
              </ImageBackground>
            </Pressable>

            {/* moving light hotspot */}
            <Animated.View pointerEvents="none" style={{
              position:"absolute", width:120, height:120, borderRadius:120, backgroundColor: `${accent}22`,
              transform:[ { translateX: spotX }, { translateY: spotY } ],
              shadowColor: accent, shadowOpacity: 0.55, shadowRadius: 28, shadowOffset:{ width:0, height:0 },
            }}/>

            {/* body */}
            <View style={{ padding:16 }}>
              <Text selectable={false} style={{ color:P.text, fontSize:18, fontFamily:"Avenir-Heavy", letterSpacing:0.3 }}>{s.title}</Text>
              <Text selectable={false} style={{ color:P.textMuted, fontSize:13, lineHeight:19, marginTop:6, fontFamily:"Avenir-Book" }}>{s.desc}</Text>

              <View style={{ flexDirection:"row", gap:14, marginTop:8 }}>
                <Text selectable={false} style={{ color:P.textMuted, fontSize:12, fontFamily:"Avenir-Book" }}>⏱ {s.minutes}m</Text>
                <Text selectable={false} style={{ color:P.textMuted, fontSize:12, fontFamily:"Avenir-Book" }}>👥 {s.group}</Text>
                <Text selectable={false} style={{ color:P.textMuted, fontSize:12, fontFamily:"Avenir-Book" }}>📍 {s.location}</Text>
              </View>

              {/* tags */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:10 }}>
                {s.tags.map((t,i)=>(
                  <View
                    key={t}
                    style={{
                      marginRight: i===s.tags.length-1?0:8,
                      paddingHorizontal:14, paddingVertical:8, borderRadius:999,
                      borderWidth:1, borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }}
                  >
                    <Text selectable={false} style={{ color: "#F8FAFF", fontSize: 12, fontFamily: "Avenir-Book", opacity: 0.9 }}>{t}</Text>
                  </View>
                ))}
              </ScrollView>

              <View style={{ flexDirection:"row", justifyContent:"space-between", marginTop:14 }}>
                <TouchableOpacity onPress={()=>{ onSave(); haptic("light"); }} style={{ padding:6 }}>
                  <Ionicons name={saved ? "heart" : "heart-outline"} size={22} color={P.p3}/>
                </TouchableOpacity>

                {/* CTA wrapper now hosts confetti and shares transforms */}
                <Animated.View
                  onLayout={onCtaLayout}
                  style={{
                    position:"relative",
                    transform:[{ translateX: ctaTx }, { translateY: ctaTy }, { scale: ctaScale }],
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={()=>{ setBurst(b=>b+1); haptic("medium"); triggerRipple(); setShowDialog(true); }}
                    style={{
                      paddingHorizontal:16, paddingVertical:12, borderRadius:12, overflow:"hidden",
                      borderWidth:1, borderColor:`${accent}AA`, backgroundColor:`${accent}26`,
                      shadowColor: accent, shadowOpacity:0.35, shadowRadius:12, shadowOffset:{ width:0, height:4 },
                    }}
                  >
                    <Text selectable={false} style={{ color:"#F6F9FF", fontFamily:"Avenir-Heavy", letterSpacing:0.2 }}>Add to party</Text>
                    {/* ripple from center */}
                    <Animated.View pointerEvents="none" style={{
                      position:"absolute", left:0, right:0, top:0, bottom:0,
                      alignItems:"center", justifyContent:"center",
                      opacity: rippleO,
                      transform:[ { scale: rippleS.interpolate({inputRange:[0,1],outputRange:[0.6,1.8]}) } ],
                    }}>
                      <View style={{ width:120, height:120, borderRadius:120, backgroundColor:`${accent}33` }}/>
                    </Animated.View>
                  </TouchableOpacity>

                  {/* Confetti erupts from CTA center */}
                  <LocalConfetti
                    trigger={burst}
                    colors={[accent, P.p1, P.p2, P.p3, "#fff"]}
                    origin={{ x: ctaBox.current.w/2, y: ctaBox.current.h/2 }}
                  />
                </Animated.View>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>
      </View>

      {/* ground glow */}
      <LinearGradient colors={["transparent", `${accent}33`, "transparent"]}
        start={{x:0,y:0}} end={{x:1,y:0}}
        style={{ position:"absolute", left:28, right:28, bottom:-10, height:16, borderRadius:12, opacity:0.8 }}/>

      <AddToPartyDialog
        visible={showDialog}
        onClose={() => setShowDialog(false)}
        P={P}
        suggestion={{
          id: s.id,
          title: s.title,
          desc: s.desc,
          location: s.location,
          minutes: s.minutes,
          tags: s.tags,
          hero: s.hero,
        }}
        onAdded={() => setShowDialog(false)}
      />
    </Animated.View>
  );
}
