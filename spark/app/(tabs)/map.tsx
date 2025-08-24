// app/(tabs)/map.tsx — complete version with pickup routing
import React, { useEffect, useMemo, useRef, useState } from "react";
import Ionicons from "react-native-vector-icons/Ionicons";
import Feather from "react-native-vector-icons/Feather";
import { Platform, Linking } from "react-native";

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";

const startNavigation = (lat: number, lng: number, label = "Destination") => {
  if (Platform.OS === "ios") {
    // Apple Maps
    Linking.openURL(`maps://?daddr=${lat},${lng}&dirflg=d`);
  } else {
    // Google Maps (Android)
    Linking.openURL(`google.navigation:q=${lat},${lng}&mode=d`);
  }
};

// Function to start navigation with pickup stop
const startNavigationWithPickup = (
  pickupLat: number,
  pickupLng: number,
  destLat: number,
  destLng: number,
  pickupLabel = "Pickup",
  destLabel = "Destination"
) => {
  if (Platform.OS === "ios") {
    // Apple Maps with waypoint
    Linking.openURL(
      `maps://?daddr=${destLat},${destLng}&dirflg=d&saddr=${pickupLat},${pickupLng}`
    );
  } else {
    // Google Maps with waypoint
    Linking.openURL(
      `google.navigation:q=${destLat},${destLng}&waypoints=${pickupLat},${pickupLng}&mode=d`
    );
  }
};

// ---------- Config & Types ----------
const { width } = Dimensions.get("window");
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ""; // set in app config

type LatLng = { latitude: number; longitude: number };

type Event = {
  id: number;
  name: string;
  location_lat: number;
  location_lng: number;
  location_name?: string;
  start_at?: string;
  description?: string;
  party_id?: string;
  party_name?: string;
  active?: boolean;
};

type Party = { id: string; name: string; picture_url?: string };

type FriendLocation = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  avatar?: string | null;
  lastSeen?: Date;
};

type RouteData = { duration: number; distance: number; coordinates: LatLng[] };

type PickupRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterLocation: LatLng;
  eventId: number;
  eventName: string;
  timestamp: Date;
  status: "pending" | "accepted" | "declined";
  acceptedBy?: string;
  acceptedByName?: string;
};

// ---------- Small UI atoms (compact) ----------
const Pill = ({ children, style }: any) => (
  <View style={[styles.pill, style]}>
    <Text style={styles.pillText}>{children}</Text>
  </View>
);

const EventMarker = ({ isJoined }: { isJoined?: boolean }) => (
  <View style={styles.markerWrap}>
    <View style={[styles.pin, isJoined ? styles.pinJoined : styles.pinEvent]}>
      <Text style={styles.pinIcon}>🎉</Text>
    </View>
  </View>
);

const FriendMarker = ({
  friend,
  isOffering,
}: {
  friend: FriendLocation;
  isOffering?: boolean;
}) => (
  <View style={styles.markerWrap}>
    <View style={[styles.friendPin, isOffering && styles.friendOffering]}>
      <View style={styles.friendAvatarBox}>
        {friend.avatar?.startsWith("http") ? (
          <Image
            source={{ uri: friend.avatar }}
            style={styles.friendAvatarImg}
          />
        ) : (
          <Text style={styles.friendInitial}>
            {friend.name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      {isOffering && (
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>🚗</Text>
        </View>
      )}
    </View>
  </View>
);

const UserMarker = ({ needsRide }: { needsRide?: boolean }) => (
  <View style={styles.markerWrap}>
    <View style={[styles.pin, needsRide && styles.pinNeeds]}>
      <Text style={styles.pinIcon}>{needsRide ? "🤚" : "📍"}</Text>
    </View>
  </View>
);

const PickupMarker = () => (
  <View style={styles.markerWrap}>
    <View style={[styles.pin, styles.pinPickup]}>
      <Text style={styles.pinIcon}>🚗</Text>
    </View>
  </View>
);

// ---------- Helpers ----------
const decodePolyline = (str: string): LatLng[] => {
  let index = 0,
    lat = 0,
    lng = 0;
  const pts: LatLng[] = [];
  while (index < str.length) {
    let b = 0,
      shift = 0,
      result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
};

const haversineKm = (a: LatLng, b: LatLng) => {
  const R = 6371,
    dLat = ((b.latitude - a.latitude) * Math.PI) / 180,
    dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const fmtDuration = (min: number) =>
  min < 60 ? `${min}min` : `${Math.floor(min / 60)}h ${min % 60}min`;
const fmtTMinus = (iso?: string) => {
  if (!iso) return "";
  const t = new Date(iso).getTime() - Date.now();
  const h = Math.max(0, Math.floor(t / 36e5)),
    m = Math.max(0, Math.floor((t % 36e5) / 6e4));
  return h ? `${h}h ${m}m` : `${m}m`;
};

const colorAt = (key: string, i: number) =>
  key === "user"
    ? "#007AFF"
    : key.startsWith("pickup-")
    ? "#EF4444"
    : ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57", "#FF9FF3"][i % 6];

// ---------- Main Screen ----------
export default function MapScreen() {
  // core app state
  const [userId, setUserId] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<Event[]>([]);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [userParties, setUserParties] = useState<Party[]>([]);

  // routes & pickup
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [routes, setRoutes] = useState<Record<string, LatLng[]>>({});
  const [routeData, setRouteData] = useState<Record<string, RouteData>>({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [pickupRequests, setPickupRequests] = useState<PickupRequest[]>([]);
  const [myPickupRequest, setMyPickupRequest] = useState<PickupRequest | null>(
    null
  );

  // NEW: Pickup routing state
  const [pickupRoutes, setPickupRoutes] = useState<Record<string, LatLng[]>>(
    {}
  );
  const [pickupRouteData, setPickupRouteData] = useState<
    Record<string, RouteData>
  >({});

  // UI
  const [showRoutesModal, setShowRoutesModal] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const mapRef = useRef<MapView | null>(null);

  // ---------- Data ops ----------
  const updateMyLocation = async (pos: LatLng) => {
    if (!userId) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("user_locations").upsert(
      {
        user_id: userId,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: 10,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );
    if (error) {
      await supabase
        .from("user_locations")
        .update({
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: 10,
          updated_at: now,
        })
        .eq("user_id", userId);
    }
  };

  const loadUserParties = async () => {
    if (!userId) return;
    const [owned, member] = await Promise.all([
      supabase.from("parties").select("*").eq("owner_id", userId),
      supabase
        .from("party_members")
        .select("parties(id,name,picture_url,owner_id)")
        .eq("user_id", userId),
    ]);
    const ownedParties: Party[] = owned.data || [];
    const memberParties: Party[] = (member.data || [])
      .map((m: any) => m.parties)
      .filter(Boolean);
    const all = [...ownedParties, ...memberParties].reduce(
      (acc: Party[], p: Party) =>
        acc.some((x) => x.id === p.id) ? acc : [...acc, p],
      []
    );
    setUserParties(all);
  };

  const loadPartyEvents = async () => {
    if (!userId || userParties.length === 0) {
      setEvents([]);
      return;
    }

    const partyIds = userParties.map((p) => p.id);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .in("party_id", partyIds)
      .eq("active", true); // only active events

    if (error || !data) {
      console.error("Error loading events:", error);
      setEvents([]);
      return;
    }

    const list: Event[] = data
      .filter((e: any) => e.location_lat != null && e.location_lng != null)
      .map((e: any) => ({
        id: e.id,
        name: e.name,
        location_lat: parseFloat(e.location_lat),
        location_lng: parseFloat(e.location_lng),
        location_name: e.location_name,
        start_at: e.start_at,
        description: e.description,
        party_id: e.party_id,
        party_name:
          userParties.find((p) => p.id === e.party_id)?.name || "Unknown",
      }));

    setEvents(list);
  };

  const loadFriendsAndLocations = async () => {
    if (!userId) return;
    const { data: friendships } = await supabase
      .from("friendships")
      .select("*")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq("status", "accepted");
    const friendIds = (friendships || []).map((f: any) =>
      f.user_id === userId ? f.friend_id : f.user_id
    );
    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const [{ data: locs }, { data: profiles }] = await Promise.all([
      supabase
        .from("user_locations")
        .select("*")
        .in("user_id", friendIds)
        .gte("updated_at", since),
      supabase
        .from("profiles")
        .select("id,username,avatar_url")
        .in("id", friendIds),
    ]);
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    const live: FriendLocation[] = (locs || []).map((l: any) => ({
      id: l.user_id,
      latitude: parseFloat(l.latitude),
      longitude: parseFloat(l.longitude),
      name: profileMap.get(l.user_id)?.username || "Friend",
      avatar: profileMap.get(l.user_id)?.avatar_url || null,
      lastSeen: new Date(l.updated_at),
    }));
    setFriends(live);
  };

  // ---------- Pickup Requests ----------
  const loadPickupRequests = async () => {
    if (!userId) return;

    const { data, error } = await supabase.from("pickup_requests").select(`
    id,
    requester_id,
    latitude,
    longitude,
    event_id,
    status,
    accepted_by,
    created_at,
    events (id, name, location_name),
    requester:requester_id (id, username),
    driver:accepted_by (id, username)
  `);

    if (error) {
      console.error("Error loading pickup requests:", error);
      return;
    }

    const ids = [...new Set((data || []).map((r: any) => r.requester_id))];
    if (ids.length === 0) {
      setPickupRequests([]);
      setMyPickupRequest(null);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,username,avatar_url")
      .in("id", ids);

    const pm = new Map((profiles || []).map((p: any) => [p.id, p.username]));

    const mapped: PickupRequest[] = (data || []).map((r: any) => ({
      id: r.id,
      requesterId: r.requester_id,
      requesterName: r.requester?.username || r.requester_id,
      requesterLocation: {
        latitude: parseFloat(r.latitude),
        longitude: parseFloat(r.longitude),
      },
      eventId: r.event_id,
      eventName: r.events?.name || "Unknown event",
      timestamp: new Date(r.created_at),
      status: r.status,
      acceptedBy: r.driver?.id || r.accepted_by,
      acceptedByName: r.driver?.username || r.accepted_by,
    }));

    const unique = Object.values(
      mapped.reduce((acc, cur) => {
        const key = `${cur.requesterId}-${cur.eventId}`;
        acc[key] = cur;
        return acc;
      }, {} as Record<string, PickupRequest>)
    );

    setPickupRequests(unique);
    setMyPickupRequest(unique.find((r) => r.requesterId === userId) || null);
  };

  useEffect(() => {
    if (!userId || userParties.length === 0) return;

    const ch = supabase
      .channel("events_updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          loadPartyEvents();
        }
      )
      .subscribe();

    return () => {
      ch.unsubscribe();
    };
  }, [userId, userParties]);

  // realtime updates
  useEffect(() => {
    if (!userId) return;

    const ch = supabase
      .channel("pickup_requests_updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pickup_requests" },
        () => loadPickupRequests()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pickup_requests" },
        () => loadPickupRequests()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "pickup_requests" },
        () => loadPickupRequests()
      )
      .subscribe();

    return () => {
      ch.unsubscribe();
    };
  }, [userId]);

  // ---------- Routing ----------
  const accurateRoute = async (
    from: LatLng,
    to: LatLng,
    waypoints?: LatLng[]
  ): Promise<RouteData> => {
    try {
      let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.latitude},${from.longitude}&destination=${to.latitude},${to.longitude}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
      if (waypoints?.length)
        url += `&waypoints=${waypoints
          .map((w) => `${w.latitude},${w.longitude}`)
          .join("|")}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== "OK" || !data.routes?.length)
        throw new Error("No route");
      const route = data.routes[0];
      const duration = Math.round(
        route.legs.reduce((s: any, l: any) => s + l.duration.value, 0) / 60
      );
      const distance =
        Math.round(
          route.legs.reduce((s: any, l: any) => s + l.distance.value, 0) / 10
        ) / 100; // km, 2dp
      const coordinates = route.overview_polyline?.points
        ? decodePolyline(route.overview_polyline.points)
        : [from, to];
      return { duration, distance, coordinates };
    } catch (e) {
      const d = haversineKm(from, to);
      const mid: LatLng = {
        latitude:
          (from.latitude + to.latitude) / 2 + (Math.random() - 0.5) * 0.002,
        longitude:
          (from.longitude + to.longitude) / 2 + (Math.random() - 0.5) * 0.002,
      };
      return {
        duration: Math.round((d / 35) * 60),
        distance: Math.round(d * 100) / 100,
        coordinates: [from, mid, to],
      };
    }
  };

  const calcEventRoutes = async (event: Event) => {
    if (!location) return;
    setIsCalculating(true);
    const target: LatLng = {
      latitude: event.location_lat,
      longitude: event.location_lng,
    };
    const newRoutes: Record<string, LatLng[]> = {};
    const newData: Record<string, RouteData> = {};
    if (joinedEvents.some((e) => e.id === event.id)) {
      const r = await accurateRoute(location, target);
      newRoutes.user = r.coordinates;
      newData.user = r;
    }
    for (const f of friends) {
      const r = await accurateRoute(
        { latitude: f.latitude, longitude: f.longitude },
        target
      );
      newRoutes[f.id] = r.coordinates;
      newData[f.id] = r;
    }
    setRoutes(newRoutes);
    setRouteData(newData);
    setIsCalculating(false);
  };

  // ---------- Actions ----------
  const showEventRoutes = async (e: Event) => {
    setSelectedEvent(e);
    setShowRoutesModal(true);
    await calcEventRoutes(e);
  };

  const toggleEventJoin = async (e: Event) => {
    const joined = joinedEvents.some((x) => x.id === e.id);
    if (joined) {
      setJoinedEvents((s) => s.filter((x) => x.id !== e.id));
      if (myPickupRequest?.eventId === e.id) {
        setPickupRequests((p) => p.filter((r) => r.id !== myPickupRequest.id));
        setMyPickupRequest(null);
      }
      if (selectedEvent?.id === e.id) {
        setRoutes({});
        setRouteData({});
      }
      Alert.alert("Left", `You left ${e.name}`);
    } else {
      setJoinedEvents((s) => [...s, e]);
      Alert.alert("Joined!", `Welcome to ${e.name}`);
      if (selectedEvent?.id === e.id) await calcEventRoutes(e);
    }
    if (mapRef.current)
      mapRef.current.animateToRegion(
        {
          latitude: e.location_lat,
          longitude: e.location_lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        800
      );
  };

  const requestPickup = async (e: Event) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("No logged-in user found:", userError);
        Alert.alert("Error", "You must be logged in to request a pickup.");
        return;
      }

      if (!location) {
        Alert.alert("Error", "Location not available");
        return;
      }

      const { data, error } = await supabase
        .from("pickup_requests")
        .insert({
          requester_id: user.id,
          latitude: location.latitude,
          longitude: location.longitude,
          event_id: e.id,
          status: "pending",
        })
        .select();

      if (error) {
        console.error("Error requesting pickup:", error);
        Alert.alert("Error", "Could not request pickup.");
        return;
      }

      if (data?.length) {
        const r = data[0];
        const pr: PickupRequest = {
          id: r.id,
          requesterId: r.requester_id,
          requesterName: "You",
          requesterLocation: { latitude: r.latitude, longitude: r.longitude },
          eventId: r.event_id,
          eventName: e.name,
          timestamp: new Date(r.created_at),
          status: r.status,
        };
        setMyPickupRequest(pr);
      }
    } catch (err) {
      console.error("Unexpected error requesting pickup:", err);
      Alert.alert("Error", "Something went wrong.");
    }
  };

  const myAcceptedPickups = useMemo(
    () =>
      pickupRequests.filter(
        (r) =>
          String(r.acceptedBy) === String(userId) && r.requesterId !== userId
      ),
    [pickupRequests, userId]
  );

  // Enhanced accept pickup with routing
  const acceptPickup = async (req: PickupRequest) => {
    console.log("acceptPickup -> req.id:", req.id, "status:", req.status);
    const { data, error } = await supabase
      .from("pickup_requests")
      .update({ status: "accepted", accepted_by: userId })
      .eq("id", req.id)
      .eq("status", "pending")
      .select();

    if (error) {
      console.error("Supabase error accepting pickup:", error);
      Alert.alert("Error", "Could not accept pickup request.");
      return;
    }

    if (!data || data.length === 0) {
      console.warn("No pickup updated – maybe already accepted?");
      Alert.alert("Too late!", "This request was already handled.");
      return;
    }

    const updated = data[0];
    const u: PickupRequest = {
      ...req,
      status: updated.status,
      acceptedBy: updated.accepted_by,
      acceptedByName: updated.accepted_by === userId ? "You" : "Friend",
    };

    setPickupRequests((p) => p.map((r) => (r.id === req.id ? u : r)));

    // Calculate route to pickup location
    if (location) {
      try {
        const routeToPickup = await accurateRoute(
          location,
          req.requesterLocation
        );
        const routeKey = `pickup-${req.id}`;

        setPickupRoutes((prev) => ({
          ...prev,
          [routeKey]: routeToPickup.coordinates,
        }));
        setPickupRouteData((prev) => ({
          ...prev,
          [routeKey]: routeToPickup,
        }));

        // Animate map to show the route
        if (mapRef.current) {
          const bounds = [location, req.requesterLocation];
          const minLat = Math.min(...bounds.map((p) => p.latitude));
          const maxLat = Math.max(...bounds.map((p) => p.latitude));
          const minLng = Math.min(...bounds.map((p) => p.longitude));
          const maxLng = Math.max(...bounds.map((p) => p.longitude));

          const centerLat = (minLat + maxLat) / 2;
          const centerLng = (minLng + maxLng) / 2;
          const deltaLat = (maxLat - minLat) * 1.5;
          const deltaLng = (maxLng - minLng) * 1.5;

          mapRef.current.animateToRegion(
            {
              latitude: centerLat,
              longitude: centerLng,
              latitudeDelta: Math.max(deltaLat, 0.01),
              longitudeDelta: Math.max(deltaLng, 0.01),
            },
            1000
          );
        }

        Alert.alert(
          "Accepted",
          `You'll pick up ${req.requesterName}. Route shown on map.`
        );
      } catch (error) {
        console.error("Error calculating pickup route:", error);
        Alert.alert("Accepted", `You'll pick up ${req.requesterName}.`);
      }
    } else {
      Alert.alert("Accepted", `You'll pick up ${req.requesterName}.`);
    }
  };

  const cancelPickup = async () => {
    if (!myPickupRequest) return;
    const { error } = await supabase
      .from("pickup_requests")
      .delete()
      .eq("id", myPickupRequest.id);
    if (error) return;
    setPickupRequests((p) => p.filter((r) => r.id !== myPickupRequest.id));
    setMyPickupRequest(null);
    Alert.alert("Cancelled", "Pickup request cancelled.");
  };

  const cancelAcceptedPickup = async (req: PickupRequest) => {
    const { data, error } = await supabase
      .from("pickup_requests")
      .update({ status: "pending", accepted_by: null })
      .eq("id", req.id)
      .eq("accepted_by", userId)
      .select();

    if (error) {
      console.error("Error canceling accepted pickup:", error);
      Alert.alert("Error", "Could not cancel pickup.");
      return;
    }

    if (data && data.length > 0) {
      setPickupRequests((p) => p.filter((r) => r.id !== req.id));

      // Remove pickup route
      const routeKey = `pickup-${req.id}`;
      setPickupRoutes((prev) => {
        const newRoutes = { ...prev };
        delete newRoutes[routeKey];
        return newRoutes;
      });
      setPickupRouteData((prev) => {
        const newData = { ...prev };
        delete newData[routeKey];
        return newData;
      });

      Alert.alert(
        "Cancelled",
        `You are no longer picking up ${req.requesterName}.`
      );
    }
  };

  const refreshFriendLocations = async () => {
    await loadFriendsAndLocations();
    Alert.alert("Refreshed", "Friend locations updated");
  };

  const centerOnUser = () => {
    if (location && mapRef.current)
      mapRef.current.animateToRegion(
        { ...location, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        800
      );
  };

  // Navigate to pickup with event as final destination
  const navigateToPickupWithEvent = (req: PickupRequest) => {
    const event = events.find((e) => e.id === req.eventId);
    if (event) {
      startNavigationWithPickup(
        req.requesterLocation.latitude,
        req.requesterLocation.longitude,
        event.location_lat,
        event.location_lng,
        `Pick up ${req.requesterName}`,
        event.name
      );
    } else {
      startNavigation(
        req.requesterLocation.latitude,
        req.requesterLocation.longitude,
        `Pick up ${req.requesterName}`
      );
    }
  };

  // ---------- Effects ----------
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) setUserId(user.id);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Location",
            "Enable location access for the best experience."
          );
          setIsLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const pos = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setLocation(pos);
        if (user) updateMyLocation(pos);
      } catch (e) {
        Alert.alert("Error", "Unable to initialize.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadUserParties();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadPartyEvents();
  }, [userId, userParties]);

  useEffect(() => {
    if (!userId || !location) return;
    loadFriendsAndLocations();
    const ch = supabase
      .channel("friend_locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_locations" },
        () => loadFriendsAndLocations()
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [userId, location]);

  useEffect(() => {
    if (!userId || !location) return;
    const id = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const pos = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setLocation(pos);
        updateMyLocation(pos);
      } catch {}
    }, 30000);
    return () => clearInterval(id);
  }, [userId, location]);

  // ---------- Derived ----------
  const pendingPickupCount = useMemo(
    () =>
      pickupRequests.filter(
        (r) => r.status === "pending" && r.requesterId !== userId
      ).length,
    [pickupRequests, userId]
  );

  const uniqueRequests = Object.values(
    pickupRequests
      .filter((r) => r.status === "pending" && r.requesterId !== userId)
      .reduce((acc, cur) => {
        acc[cur.requesterId] = cur;
        return acc;
      }, {} as Record<string, PickupRequest>)
  );

  // ---------- Render ----------
  if (isLoading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.muted}>Initializing map...</Text>
      </View>
    );

  if (!location)
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Location access required</Text>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => setIsLoading(true)}
        >
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{
          ...location,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        <Marker
          coordinate={location}
          title="You"
          description="Your current location"
        >
          <UserMarker
            needsRide={
              !!myPickupRequest && myPickupRequest.status === "pending"
            }
          />
        </Marker>

        {joinedEvents.map((e) => (
          <Marker
            key={`event-${e.id}`}
            coordinate={{ latitude: e.location_lat, longitude: e.location_lng }}
            title={e.name}
            description={e.location_name}
          >
            <EventMarker isJoined />
          </Marker>
        ))}

        {friends.map((f) => {
          const offering = pickupRequests.some(
            (r) => r.acceptedBy === f.id && r.status === "accepted"
          );
          return (
            <Marker
              key={`friend-${f.id}`}
              coordinate={{ latitude: f.latitude, longitude: f.longitude }}
              title={f.name}
              description={offering ? "Offering rides" : "Online"}
            >
              <FriendMarker friend={f} isOffering={offering} />
            </Marker>
          );
        })}

        {/* Pickup location markers for accepted pickups */}
        {myAcceptedPickups.map((req) => (
          <Marker
            key={`pickup-marker-${req.id}`}
            coordinate={req.requesterLocation}
            title={`Pick up ${req.requesterName}`}
            description={`Going to ${req.eventName}`}
          >
            <PickupMarker />
          </Marker>
        ))}

        {/* Event routes */}
        {Object.entries(routes).map(([key, coords], i) => (
          <Polyline
            key={`route-${key}`}
            coordinates={coords}
            strokeColor={colorAt(key, i)}
            strokeWidth={key === "user" ? 5 : 4}
            lineJoin="round"
            lineCap="round"
          />
        ))}

        {/* Pickup routes */}
        {Object.entries(pickupRoutes).map(([key, coords], i) => (
          <Polyline
            key={`pickup-route-${key}`}
            coordinates={coords}
            strokeColor={colorAt(key, i)}
            strokeWidth={5}
            lineJoin="round"
            lineCap="round"
          />
        ))}
      </MapView>

      {/* Controls */}
      <View style={styles.controlsRight}>
        <TouchableOpacity style={styles.fab} onPress={centerOnUser}>
          <Feather name="crosshair" size={22} color="#444" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.fab} onPress={refreshFriendLocations}>
          <Feather name="refresh-cw" size={22} color="#444" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowPickupModal(true)}
        >
          <Feather name="truck" size={22} color="#444" />
          {uniqueRequests.length > 0 && (
            <View style={styles.badgeCount}>
              <Text style={styles.badgeCountText}>{uniqueRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Status */}
      <View style={styles.statusLeft}>
        {myPickupRequest && (
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.statusBox,
                myPickupRequest.status === "pending"
                  ? styles.statusPending
                  : styles.statusAccepted,
              ]}
            >
              <Feather
                name={
                  myPickupRequest.status === "pending"
                    ? "clock"
                    : "check-circle"
                }
                size={18}
                color={
                  myPickupRequest.status === "pending" ? "#6B7280" : "#22C55E"
                }
              />
              <Text style={styles.statusText}>
                {myPickupRequest.status === "pending"
                  ? "Waiting for pickup..."
                  : `${myPickupRequest.acceptedByName} will pick you up!`}
              </Text>
              {myPickupRequest.status === "pending" && (
                <TouchableOpacity
                  style={styles.btnDangerSm}
                  onPress={cancelPickup}
                >
                  <Text style={styles.btnDangerSmText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Event cards */}
      {events.length > 0 && (
        <View style={styles.cardsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cards}
            decelerationRate="fast"
            snapToInterval={width * 0.65 + 12}
            snapToAlignment="start"
          >
            {events.map((e) => {
              const joined = joinedEvents.some((x) => x.id === e.id);
              const wantPickup = myPickupRequest?.eventId === e.id;
              return (
                <View key={e.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Pill>{e.party_name || e.location_name}</Pill>
                    {!!e.start_at && (
                      <Text style={styles.timeSmall}>
                        {fmtTMinus(e.start_at)}
                      </Text>
                    )}
                  </View>

                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {e.name}
                  </Text>

                  {!!e.description && (
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {e.description}
                    </Text>
                  )}

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => showEventRoutes(e)}
                    >
                      <Ionicons
                        name="location-outline"
                        size={20}
                        color="#444"
                      />
                      <Text style={styles.iconLabel}>Route</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() =>
                        startNavigation(e.location_lat, e.location_lng, e.name)
                      }
                    >
                      <Ionicons
                        name="navigate-outline"
                        size={20}
                        color="#444"
                      />
                      <Text style={styles.iconLabel}>Maps</Text>
                    </TouchableOpacity>

                    {joined && !wantPickup && (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => requestPickup(e)}
                      >
                        <Ionicons name="car-outline" size={20} color="#444" />
                        <Text style={styles.iconLabel}>Pickup</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.btnJoin, joined && styles.btnJoined]}
                      onPress={() => toggleEventJoin(e)}
                    >
                      <Text style={styles.btnJoinText}>
                        {joined ? "✓" : "Start Event"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Modal
        visible={showPickupModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPickupModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <View>
              <Text style={styles.modalTitle}>Pickup Overview</Text>
              <Text style={styles.modalSub}>
                Your route, accepted pickups, and requests
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowPickupModal(false)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Your Route */}
            {routeData.user && (
              <View style={styles.routeSection}>
                <Text style={styles.sectionTitle}>Your Route</Text>
                <View style={styles.routeRow}>
                  <View style={styles.routeWho}>
                    <View
                      style={[styles.colorDot, { backgroundColor: "#007AFF" }]}
                    />
                    <Text style={styles.routeName}>
                      You → {selectedEvent?.name}
                    </Text>
                  </View>
                  <View style={styles.routeStats}>
                    <Text style={styles.routeTime}>
                      {fmtDuration(routeData.user.duration)}
                    </Text>
                    <Text style={styles.routeDist}>
                      {routeData.user.distance}km
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Friends' Routes */}
            {Object.keys(routeData).filter((k) => k !== "user").length > 0 && (
              <View style={styles.routeSection}>
                <Text style={styles.sectionTitle}>Friends' Routes</Text>
                {Object.entries(routeData)
                  .filter(([key]) => key !== "user")
                  .map(([friendId, data], i) => {
                    const friend = friends.find((f) => f.id === friendId);
                    return (
                      <View key={friendId} style={styles.routeRow}>
                        <View style={styles.routeWho}>
                          <View
                            style={[
                              styles.colorDot,
                              { backgroundColor: colorAt(friendId, i) },
                            ]}
                          />
                          <View style={styles.routeAvatarBox}>
                            {friend?.avatar?.startsWith("http") ? (
                              <Image
                                source={{ uri: friend.avatar }}
                                style={styles.routeAvatarImg}
                              />
                            ) : (
                              <Text style={styles.routeAvatarInitial}>
                                {friend?.name?.charAt(0)?.toUpperCase() || "?"}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.routeName}>
                            {friend?.name || "Friend"}
                          </Text>
                        </View>
                        <View style={styles.routeStats}>
                          <Text style={styles.routeTime}>
                            {fmtDuration(data.duration)}
                          </Text>
                          <Text style={styles.routeDist}>
                            {data.distance}km
                          </Text>
                        </View>
                      </View>
                    );
                  })}
              </View>
            )}

            {/* Pickup Routes */}
            {Object.keys(pickupRouteData).length > 0 && (
              <View style={styles.routeSection}>
                <Text style={styles.sectionTitle}>🚗 Pickup Routes</Text>
                {Object.entries(pickupRouteData).map(([routeKey, data]) => {
                  const pickupId = routeKey.replace("pickup-", "");
                  const pickup = myAcceptedPickups.find(
                    (p) => p.id === pickupId
                  );
                  if (!pickup) return null;

                  return (
                    <View key={routeKey} style={styles.routeRow}>
                      <View style={styles.routeWho}>
                        <View
                          style={[
                            styles.colorDot,
                            { backgroundColor: "#EF4444" },
                          ]}
                        />
                        <Text style={styles.routeName}>
                          You → {pickup.requesterName}
                        </Text>
                      </View>
                      <View style={styles.routeStats}>
                        <Text style={styles.routeTime}>
                          {fmtDuration(data.duration)}
                        </Text>
                        <Text style={styles.routeDist}>{data.distance}km</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Accepted pickups */}
            {myAcceptedPickups.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>🚗 You're Picking Up</Text>
                {myAcceptedPickups.map((r) => {
                  const e = events.find((x) => x.id === r.eventId);
                  return (
                    <View key={r.id} style={styles.reqCard}>
                      <View style={styles.reqHead}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reqName}>{r.requesterName}</Text>
                          <Text style={styles.reqEvent}>
                            Going to {r.eventName}
                          </Text>
                        </View>
                        <Text style={styles.reqTime}>
                          {new Date(r.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      <Text style={styles.reqDesc}>
                        Pickup near {e?.location_name || "event"}
                      </Text>
                      <View style={styles.reqActions}>
                        <TouchableOpacity
                          style={styles.btnNavigate}
                          onPress={() => {
                            navigateToPickupWithEvent(r);
                            setShowPickupModal(false);
                          }}
                        >
                          <Text style={styles.btnNavigateText}>
                            🧭 Navigate
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.btnGhost}
                          onPress={() => cancelAcceptedPickup(r)}
                        >
                          <Text style={styles.btnGhostText}>✕ Cancel Ride</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* Pending pickup requests */}
            {uniqueRequests.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>🤚 Pending Requests</Text>
                {uniqueRequests.map((r) => {
                  const e = events.find((x) => x.id === r.eventId);
                  if (!e) return null;
                  return (
                    <View key={r.id} style={styles.reqCard}>
                      <View style={styles.reqHead}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reqName}>{r.requesterName}</Text>
                          <Text style={styles.reqEvent}>
                            {r.eventName || e.name}
                          </Text>
                        </View>
                        <Text style={styles.reqTime}>
                          {new Date(r.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      <Text style={styles.reqDesc}>
                        Needs a ride to {e.location_name || "the event"}
                      </Text>
                      <View style={styles.reqActions}>
                        <TouchableOpacity
                          style={styles.btnAccept}
                          onPress={() => {
                            acceptPickup(r);
                            setShowPickupModal(false);
                          }}
                        >
                          <Text style={styles.btnAcceptText}>✓ Offer Ride</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.btnGhost}
                          onPress={() =>
                            setPickupRequests((p) =>
                              p.map((x) =>
                                x.id === r.id ? { ...x, status: "declined" } : x
                              )
                            )
                          }
                        >
                          <Text style={styles.btnGhostText}>✕ Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {pendingPickupCount === 0 && myAcceptedPickups.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>🚗 No pickups</Text>
                <Text style={styles.muted}>
                  When friends need rides or you accept pickups, they'll appear
                  here.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Routes Modal */}
      <Modal
        visible={showRoutesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRoutesModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <View>
              <Text style={styles.modalTitle}>
                {selectedEvent
                  ? `Routes to ${selectedEvent.name}`
                  : "Event Routes"}
              </Text>
              <Text style={styles.modalSub}>
                {selectedEvent?.location_name || "Event location"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowRoutesModal(false)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {isCalculating ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.muted}>Calculating routes...</Text>
              </View>
            ) : (
              <>
                {routeData.user && (
                  <View style={styles.routeSection}>
                    <Text style={styles.sectionTitle}>Your Route</Text>
                    <View style={styles.routeRow}>
                      <View style={styles.routeWho}>
                        <View
                          style={[
                            styles.colorDot,
                            { backgroundColor: "#007AFF" },
                          ]}
                        />
                        <Text style={styles.routeName}>You</Text>
                      </View>
                      <View style={styles.routeStats}>
                        <Text style={styles.routeTime}>
                          {fmtDuration(routeData.user.duration)}
                        </Text>
                        <Text style={styles.routeDist}>
                          {routeData.user.distance}km
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {Object.keys(routeData).filter((k) => k !== "user").length >
                  0 && (
                  <View style={styles.routeSection}>
                    <Text style={styles.sectionTitle}>Friends' Routes</Text>
                    {Object.entries(routeData)
                      .filter(([key]) => key !== "user")
                      .map(([friendId, data], i) => {
                        const friend = friends.find((f) => f.id === friendId);
                        return (
                          <View key={friendId} style={styles.routeRow}>
                            <View style={styles.routeWho}>
                              <View
                                style={[
                                  styles.colorDot,
                                  { backgroundColor: colorAt(friendId, i) },
                                ]}
                              />
                              <View style={styles.routeAvatarBox}>
                                {friend?.avatar?.startsWith("http") ? (
                                  <Image
                                    source={{ uri: friend.avatar }}
                                    style={styles.routeAvatarImg}
                                  />
                                ) : (
                                  <Text style={styles.routeAvatarInitial}>
                                    {friend?.name?.charAt(0)?.toUpperCase() ||
                                      "?"}
                                  </Text>
                                )}
                              </View>
                              <Text style={styles.routeName}>
                                {friend?.name || "Friend"}
                              </Text>
                            </View>
                            <View style={styles.routeStats}>
                              <Text style={styles.routeTime}>
                                {fmtDuration(data.duration)}
                              </Text>
                              <Text style={styles.routeDist}>
                                {data.distance}km
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ---------- Styles (compact) ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  map: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8F9FA",
    padding: 20,
  },
  muted: { marginTop: 12, fontSize: 14, color: "#6B7280", textAlign: "center" },
  error: {
    fontSize: 18,
    fontWeight: "600",
    color: "#EF4444",
    marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // controls
  controlsRight: { position: "absolute", top: 60, right: 20, zIndex: 10 },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#e2cbf6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  fabIcon: { fontSize: 20 },
  fabAlert: { position: "relative" },
  badgeCount: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: "center",
  },
  badgeCountText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  // status
  statusLeft: {
    position: "absolute",
    top: 33,
    left: 5,
    right: 55,
    zIndex: 10,
  },

  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  statusText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#482652",
    marginLeft: 8,
  },

  statusPending: {
    backgroundColor: "#f9a8d4", // yellow
  },

  statusAccepted: {
    backgroundColor: "#e2cbf6", // green
  },

  btnDangerSm: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 8,
  },

  btnDangerSmText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  // cards
  cardsWrap: {
    position: "absolute",
    bottom: "2%", // lifted up slightly
    left: 0,
    right: 0,
  },
  cards: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    width: width * 0.7, // bigger → 70% of screen
    marginRight: 14,
    borderRadius: 14,
    backgroundColor: "#e2cbf6",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    alignSelf: "center",
  },

  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pill: {
    backgroundColor: "rgba(59,130,246,0.1)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pillText: { color: "#3B82F6", fontSize: 10, fontWeight: "600" },
  timeSmall: { fontSize: 11, color: "#6B7280", fontWeight: "500" },

  cardTitle: {
    fontSize: 16, // slightly bigger title
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 6,
  },
  cardDesc: { fontSize: 13, color: "#6B7280", marginBottom: 10 },

  iconLabel: {
    fontSize: 10,
    color: "#444",
    marginTop: 2,
  },

  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10, // adds space between children
  },
  iconBtn: {
    backgroundColor: "#cb6de6",
    borderRadius: 6,
    width: 50, // give a bit more width
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    padding: 4, // breathing room
  },

  iconText: { fontSize: 15 },

  btnJoin: {
    backgroundColor: "#cb6ce6",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
  },
  btnJoined: { backgroundColor: "#cb6ce6" },
  btnJoinText: { color: "black", fontSize: 14, fontWeight: "600" },

  // markers
  markerWrap: { alignItems: "center" },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  pinIcon: { fontSize: 20 },
  pinEvent: { backgroundColor: "#3B82F6" },
  pinJoined: { backgroundColor: "#10B981" },
  pinNeeds: { backgroundColor: "#EF4444" },
  pinPickup: { backgroundColor: "#F59E0B" }, // Added style for pickup pin
  friendPin: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "#6366F1",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    position: "relative",
  },
  friendOffering: { backgroundColor: "#F59E0B", borderColor: "#FEF3C7" },
  friendAvatarBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  friendAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
  },
  friendInitial: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeEmoji: { fontSize: 10 },

  // modal
  modal: { flex: 1, backgroundColor: "#F8F9FA" },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  modalSub: { fontSize: 14, color: "#6B7280", marginTop: 2 },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: { fontSize: 16, color: "#6B7280", fontWeight: "700" },
  modalBody: { flex: 1, padding: 20 },

  // routes list
  routeSection: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
  },
  routeRow: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  routeWho: { flexDirection: "row", alignItems: "center", flex: 1 },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  routeName: { fontSize: 16, fontWeight: "500", color: "#1F2937" },
  routeAvatarBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    overflow: "hidden",
  },
  routeAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  routeAvatarInitial: { fontSize: 12, fontWeight: "700", color: "#374151" },
  routeStats: { alignItems: "flex-end" },
  routeTime: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  routeDist: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  emptyBox: { padding: 40, alignItems: "center" },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 6,
  },

  // pickup cards
  reqCard: {
    backgroundColor: "#e2cbf6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  reqHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  reqName: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  reqEvent: { fontSize: 14, color: "#6B7280", marginTop: 2 },
  reqTime: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  reqDesc: { fontSize: 14, color: "#6B7280", marginBottom: 16 },
  reqActions: { flexDirection: "row", gap: 12 },
  btnAccept: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
  },
  btnAcceptText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  btnGhost: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
  },
  btnGhostText: { color: "#6B7280", fontSize: 14, fontWeight: "700" },
  btnNavigate: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
  },
  btnNavigateText: { color: "#007AFF", fontSize: 14, fontWeight: "700" },
});
