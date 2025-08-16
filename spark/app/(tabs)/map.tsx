// app/(tabs)/map.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  Modal,
  ActivityIndicator,
  Image,
} from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, Polyline } from "react-native-maps";
import { supabase } from "@/lib/supabase";

const { width, height } = Dimensions.get("window");

const GOOGLE_MAPS_API_KEY = "AIzaSyBGLPfyTuneCOgYaAzxG8_zd6fkcMtbXf8";

interface Event {
  id: number;
  name: string;
  location_lat: number;
  location_lng: number;
  location_name?: string;
  start_at?: string;
  description?: string;
}

interface FriendLocation {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  avatar?: string | null;
  lastSeen?: Date;
}

interface Profile {
  id: string;
  username: string;
  avatar_url?: string;
}

interface RouteData {
  duration: number; // minutes
  distance: number; // km
  coordinates: { latitude: number; longitude: number }[];
}

interface PickupRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterLocation: { latitude: number; longitude: number };
  eventId: number;
  eventName: string;
  timestamp: Date;
  status: "pending" | "accepted" | "declined";
  acceptedBy?: string;
  acceptedByName?: string;
}

// Enhanced custom marker components
const EventMarker = ({ isJoined }: { isJoined?: boolean }) => (
  <View style={styles.markerContainer}>
    <View
      style={[
        styles.markerPin,
        isJoined ? styles.joinedEventPin : styles.eventPin,
      ]}
    >
      <Text style={styles.markerIcon}>🎉</Text>
    </View>
    <View />
  </View>
);

const FriendMarker = ({
  friend,
  isOffering,
}: {
  friend: FriendLocation;
  isOffering?: boolean;
}) => (
  <View style={styles.markerContainer}>
    <View
      style={[styles.friendMarkerPin, isOffering && styles.offeringFriendPin]}
    >
      <View style={styles.friendAvatarContainer}>
        {friend.avatar && friend.avatar.startsWith("http") ? (
          <Image
            source={{ uri: friend.avatar }}
            style={styles.friendAvatarImage}
            defaultSource={{
              uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            }}
          />
        ) : (
          <Text style={styles.friendInitial}>
            {friend.name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      {isOffering && (
        <View style={styles.carBadge}>
          <Text style={styles.carIcon}>🚗</Text>
        </View>
      )}
    </View>
    <View />
  </View>
);

const UserMarker = ({ needsRide }: { needsRide?: boolean }) => (
  <View style={styles.markerContainer}>
    <View style={[styles.userMarkerPin, needsRide && styles.needsRidePin]}>
      <Text style={styles.markerIcon}>{needsRide ? "🤚" : "📍"}</Text>
    </View>
    <View />
  </View>
);

export default function MapScreen() {
  // Core state
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<Event[]>([]);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Route and ETA state
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [routes, setRoutes] = useState<{
    [key: string]: { latitude: number; longitude: number }[];
  }>({});
  const [routeData, setRouteData] = useState<{ [key: string]: RouteData }>({});
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState(false);

  // Pickup system state
  const [pickupRequests, setPickupRequests] = useState<PickupRequest[]>([]);
  const [myPickupRequest, setMyPickupRequest] = useState<PickupRequest | null>(
    null
  );

  // UI state
  const [showRoutesModal, setShowRoutesModal] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState(false);

  const mapRef = useRef<MapView | null>(null);

  // Update user's location in database - FIXED VERSION
  const updateMyLocation = async (currentLocation: {
    latitude: number;
    longitude: number;
  }) => {
    if (!currentLocation || !userId) return;

    try {
      // Use upsert with onConflict to handle the unique constraint properly
      const { error } = await supabase.from("user_locations").upsert(
        {
          user_id: userId,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: 10,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id", // Specify the conflict column
        }
      );

      if (error) {
        console.error("Error updating location:", error);
        // Alternative approach if upsert still fails
        await handleLocationUpdateFallback(currentLocation);
      }
    } catch (error) {
      console.error("Error updating location:", error);
      await handleLocationUpdateFallback(currentLocation);
    }
  };

  // Fallback function that tries update first, then insert
  const handleLocationUpdateFallback = async (currentLocation: {
    latitude: number;
    longitude: number;
  }) => {
    try {
      // Try to update first
      const { data: updateData, error: updateError } = await supabase
        .from("user_locations")
        .update({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: 10,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select();

      // If update didn't affect any rows, try insert
      if (updateError || !updateData || updateData.length === 0) {
        const { error: insertError } = await supabase
          .from("user_locations")
          .insert({
            user_id: userId,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: 10,
            updated_at: new Date().toISOString(),
          });

        if (insertError && insertError.code !== "23505") {
          // Ignore duplicate key errors, log others
          console.error("Error inserting location:", insertError);
        }
      }
    } catch (error) {
      console.error("Error in location fallback:", error);
    }
  };

  // Load real friends and their live locations - UPDATED WITH PROFILE PICTURES
  const loadFriendsAndLocations = async () => {
    if (!userId) return;

    try {
      // Get accepted friends
      const { data: friendships, error: friendshipsError } = await supabase
        .from("friendships")
        .select("*")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq("status", "accepted");

      if (friendshipsError) {
        console.error("Error loading friendships:", friendshipsError);
        return;
      }

      // Extract friend user IDs
      const friendIds =
        friendships?.map((friendship) => {
          // Return the friend's ID (not the current user's ID)
          return friendship.user_id === userId
            ? friendship.friend_id
            : friendship.user_id;
        }) || [];

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      // Get live locations for these friends (last 5 minutes)
      const { data: friendLocations, error: locationsError } = await supabase
        .from("user_locations")
        .select("*")
        .in("user_id", friendIds)
        .gte("updated_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

      if (locationsError) {
        console.error("Error loading friend locations:", locationsError);
        return;
      }

      // Get profiles for these users separately
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", friendIds);

      if (profilesError) {
        console.error("Error loading profiles:", profilesError);
        return;
      }

      // Create a map of user profiles for quick lookup
      const profileMap = new Map(
        profiles?.map((profile) => [profile.id, profile]) || []
      );

      // Transform to FriendLocation format with proper avatar handling
      const liveFriends: FriendLocation[] =
        friendLocations?.map((location) => {
          const profile = profileMap.get(location.user_id);
          return {
            id: location.user_id,
            latitude: parseFloat(location.latitude),
            longitude: parseFloat(location.longitude),
            name: profile?.username || "Friend",
            avatar: profile?.avatar_url || null, // Use actual avatar_url or null
            lastSeen: new Date(location.updated_at),
          };
        }) || [];

      setFriends(liveFriends);
      console.log(`Loaded ${liveFriends.length} live friends`);
    } catch (error) {
      console.error("Error loading friends and locations:", error);
    }
  };

  // Initialize user and location
  useEffect(() => {
    const initialize = async () => {
      try {
        // Get user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) setUserId(user.id);

        // Get location permission and current location
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Location Permission",
            "Please enable location access for the best experience."
          );
          setIsLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const currentLocation = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };

        setLocation(currentLocation);

        // Update location in database if we have a user
        if (user) {
          updateMyLocation(currentLocation);
        }
      } catch (error) {
        console.error("Initialization error:", error);
        Alert.alert("Error", "Unable to initialize. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  // Load friends when user and location are ready
  useEffect(() => {
    if (!userId || !location) return;

    loadFriendsAndLocations();

    // Set up realtime subscription for friend location updates
    const subscription = supabase
      .channel("friend_locations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_locations",
        },
        (payload) => {
          console.log("Friend location update:", payload);
          loadFriendsAndLocations(); // Reload friends when locations change
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId, location]);

  // Periodically update own location
  useEffect(() => {
    if (!location || !userId) return;

    // Update location every 30 seconds
    const locationInterval = setInterval(() => {
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
        .then((loc) => {
          const newLocation = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setLocation(newLocation);
          updateMyLocation(newLocation);
        })
        .catch((error) => {
          console.error("Error updating location:", error);
        });
    }, 30000);

    return () => {
      clearInterval(locationInterval);
    };
  }, [userId]);

  // Load demo events when location is available
  useEffect(() => {
    if (!location) return;

    // Demo events around user location
    const demoEvents: Event[] = [
      {
        id: 1,
        name: "Tech Networking Mixer",
        location_lat: location.latitude + 0.01,
        location_lng: location.longitude + 0.01,
        location_name: "Innovation Hub",
        description: "Connect with fellow developers and entrepreneurs",
        start_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 2,
        name: "Weekend Beach Volleyball",
        location_lat: location.latitude + 0.02,
        location_lng: location.longitude - 0.015,
        location_name: "Waterfront Sports Complex",
        description: "Friendly competitive games by the water",
        start_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 3,
        name: "Coffee & Code Session",
        location_lat: location.latitude - 0.012,
        location_lng: location.longitude + 0.018,
        location_name: "Central Café",
        description: "Collaborative coding in a relaxed environment",
        start_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      },
    ];

    setEvents(demoEvents);
  }, [location]);

  // Google Maps API - Decode polyline
  const decodePolyline = (
    str: string
  ): { latitude: number; longitude: number }[] => {
    let index = 0;
    const len = str.length;
    let lat = 0;
    let lng = 0;
    const coordinates: { latitude: number; longitude: number }[] = [];

    while (index < len) {
      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      coordinates.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return coordinates;
  };

  // Calculate accurate route using Google Maps API
  const calculateAccurateRoute = async (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
    waypoints?: { latitude: number; longitude: number }[]
  ): Promise<RouteData> => {
    try {
      let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.latitude},${from.longitude}&destination=${to.latitude},${to.longitude}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;

      if (waypoints && waypoints.length > 0) {
        const waypointStr = waypoints
          .map((wp) => `${wp.latitude},${wp.longitude}`)
          .join("|");
        url += `&waypoints=${waypointStr}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
        throw new Error("No route found");
      }

      const route = data.routes[0];
      let totalDuration = 0;
      let totalDistance = 0;

      // Sum up all legs
      route.legs.forEach((leg: any) => {
        totalDuration += leg.duration.value;
        totalDistance += leg.distance.value;
      });

      // Decode polyline for accurate path
      let coordinates: { latitude: number; longitude: number }[] = [];
      if (route.overview_polyline?.points) {
        coordinates = decodePolyline(route.overview_polyline.points);
      } else {
        coordinates = waypoints ? [from, ...waypoints, to] : [from, to];
      }

      return {
        duration: Math.round(totalDuration / 60), // Convert to minutes
        distance: Math.round((totalDistance / 1000) * 100) / 100, // Convert to km
        coordinates,
      };
    } catch (error) {
      console.log("Google Maps API failed, using fallback:", error);
      // Enhanced fallback calculation with more realistic routing
      const distance = calculateDistance(from, to);
      const duration = Math.round((distance / 35) * 60); // Assume 35 km/h average in city

      // Create more realistic path with intermediate points
      const midLat = (from.latitude + to.latitude) / 2;
      const midLng = (from.longitude + to.longitude) / 2;

      // Add slight curve to make route look more natural
      const offset = 0.002;
      const curveLat = midLat + (Math.random() - 0.5) * offset;
      const curveLng = midLng + (Math.random() - 0.5) * offset;

      return {
        duration,
        distance: Math.round(distance * 100) / 100,
        coordinates: [from, { latitude: curveLat, longitude: curveLng }, to],
      };
    }
  };

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (
    pos1: { latitude: number; longitude: number },
    pos2: { latitude: number; longitude: number }
  ) => {
    const R = 6371; // Earth's radius in km
    const dLat = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
    const dLng = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((pos1.latitude * Math.PI) / 180) *
        Math.cos((pos2.latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calculate all routes for selected event
  const calculateEventRoutes = async (event: Event) => {
    if (!location) return;

    setIsCalculatingRoutes(true);
    const newRoutes: {
      [key: string]: { latitude: number; longitude: number }[];
    } = {};
    const newRouteData: { [key: string]: RouteData } = {};

    try {
      const eventLocation = {
        latitude: event.location_lat,
        longitude: event.location_lng,
      };

      // Calculate user route (only if joined the event)
      if (joinedEvents.some((e) => e.id === event.id)) {
        const userRoute = await calculateAccurateRoute(location, eventLocation);
        newRoutes.user = userRoute.coordinates;
        newRouteData.user = userRoute;
      }

      // Calculate friend routes
      for (const friend of friends) {
        const friendLocation = {
          latitude: friend.latitude,
          longitude: friend.longitude,
        };

        const friendRoute = await calculateAccurateRoute(
          friendLocation,
          eventLocation
        );
        newRoutes[friend.id] = friendRoute.coordinates;
        newRouteData[friend.id] = friendRoute;
      }

      setRoutes(newRoutes);
      setRouteData(newRouteData);
    } catch (error) {
      console.error("Error calculating routes:", error);
      Alert.alert(
        "Route Error",
        "Unable to calculate accurate routes. Please try again."
      );
    } finally {
      setIsCalculatingRoutes(false);
    }
  };

  // Show routes modal
  const showEventRoutes = async (event: Event) => {
    setSelectedEvent(event);
    setShowRoutesModal(true);
    await calculateEventRoutes(event);
  };

  // Join/leave event
  const toggleEventJoin = async (event: Event) => {
    const isJoined = joinedEvents.some((e) => e.id === event.id);

    if (isJoined) {
      setJoinedEvents((prev) => prev.filter((e) => e.id !== event.id));

      // Remove any pickup requests for this event
      if (myPickupRequest?.eventId === event.id) {
        setMyPickupRequest(null);
        setPickupRequests((prev) =>
          prev.filter((req) => req.id !== myPickupRequest.id)
        );
      }

      // Clear routes if currently viewing this event
      if (selectedEvent?.id === event.id) {
        setRoutes({});
        setRouteData({});
      }

      Alert.alert("✅ Left Event", `You've left ${event.name}`);
    } else {
      setJoinedEvents((prev) => [...prev, event]);
      Alert.alert("🎉 Joined Event!", `Welcome to ${event.name}!`);
    }

    // Update routes if viewing this event (only recalculate if joining)
    if (selectedEvent?.id === event.id && !isJoined) {
      await calculateEventRoutes(event);
    }

    // Center map on event
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: event.location_lat,
          longitude: event.location_lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        1000
      );
    }
  };

  // Pickup system functions
  const requestPickup = async (event: Event) => {
    if (!location || myPickupRequest?.eventId === event.id) return;

    const newRequest: PickupRequest = {
      id: `pickup_${userId}_${event.id}_${Date.now()}`,
      requesterId: userId,
      requesterName: "You",
      requesterLocation: location,
      eventId: event.id,
      eventName: event.name,
      timestamp: new Date(),
      status: "pending",
    };

    setMyPickupRequest(newRequest);
    setPickupRequests((prev) => [...prev, newRequest]);

    Alert.alert(
      "🚗 Pickup Requested!",
      `Your ride request for ${event.name} has been sent to friends. They'll be notified and can offer you a ride!`
    );
  };

  const acceptPickupRequest = async (request: PickupRequest) => {
    const updatedRequest = {
      ...request,
      status: "accepted" as const,
      acceptedBy: userId,
      acceptedByName: "You",
    };

    setPickupRequests((prev) =>
      prev.map((req) => (req.id === request.id ? updatedRequest : req))
    );

    Alert.alert(
      "✅ Pickup Accepted!",
      `You've agreed to pick up ${request.requesterName} for ${request.eventName}. Your route will include the pickup stop.`
    );

    // Recalculate routes with pickup waypoint
    if (selectedEvent?.id === request.eventId) {
      await calculateEventRoutes(selectedEvent);
    }
  };

  const cancelPickupRequest = () => {
    if (myPickupRequest) {
      setPickupRequests((prev) =>
        prev.filter((req) => req.id !== myPickupRequest.id)
      );
      setMyPickupRequest(null);
      Alert.alert(
        "❌ Pickup Cancelled",
        "Your ride request has been cancelled."
      );
    }
  };

  // Refresh friend locations manually
  const refreshFriendLocations = async () => {
    await loadFriendsAndLocations();
    Alert.alert("🔄 Refreshed", "Friend locations updated!");
  };

  // Center map on user location
  const centerOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          ...location,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        1000
      );
    }
  };

  // Format duration for display
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  // Format time until event
  const formatTimeUntil = (dateString: string) => {
    const eventTime = new Date(dateString);
    const now = new Date();
    const diff = eventTime.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Get route colors
  const getRouteColor = (key: string, index: number) => {
    if (key === "user") return "#007AFF";
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FECA57",
      "#FF9FF3",
    ];
    return colors[index % colors.length];
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Initializing map...</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Location access required</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => setIsLoading(true)}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
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
        {/* User marker */}
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

        {/* Event markers - only show joined events */}
        {joinedEvents.map((event) => (
          <Marker
            key={`event-${event.id}`}
            coordinate={{
              latitude: event.location_lat,
              longitude: event.location_lng,
            }}
            title={event.name}
            description={event.location_name}
          >
            <EventMarker isJoined={true} />
          </Marker>
        ))}

        {/* Friend markers - only real friends who are online */}
        {friends.map((friend) => {
          const isOffering = pickupRequests.some(
            (req) => req.acceptedBy === friend.id && req.status === "accepted"
          );
          return (
            <Marker
              key={`friend-${friend.id}`}
              coordinate={{
                latitude: friend.latitude,
                longitude: friend.longitude,
              }}
              title={friend.name}
              description={isOffering ? "Offering rides" : "Online"}
            >
              <FriendMarker friend={friend} isOffering={isOffering} />
            </Marker>
          );
        })}

        {/* Enhanced route polylines with animations */}
        {Object.entries(routes).map(([key, coords], index) => (
          <Polyline
            key={`route-${key}`}
            coordinates={coords}
            strokeColor={getRouteColor(key, index)}
            strokeWidth={key === "user" ? 5 : 4}
            lineJoin="round"
            lineCap="round"
          />
        ))}
      </MapView>

      {/* Control buttons */}
      <View style={styles.controlButtons}>
        <TouchableOpacity style={styles.controlButton} onPress={centerOnUser}>
          <Text style={styles.controlButtonText}>🎯</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={refreshFriendLocations}
        >
          <Text style={styles.controlButtonText}>🔄</Text>
        </TouchableOpacity>

        {pickupRequests.filter(
          (req) => req.status === "pending" && req.requesterId !== userId
        ).length > 0 && (
          <TouchableOpacity
            style={[styles.controlButton, styles.pickupButton]}
            onPress={() => setShowPickupModal(true)}
          >
            <Text style={styles.controlButtonText}>🚗</Text>
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {
                  pickupRequests.filter(
                    (req) =>
                      req.status === "pending" && req.requesterId !== userId
                  ).length
                }
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Status indicators */}
      <View style={styles.statusIndicators}>
        {friends.length > 0 ? (
          <View style={styles.statusIndicator}>
            <Text style={styles.statusText}>
              👥 {friends.length} friends nearby (last 5min)
            </Text>
          </View>
        ) : (
          <View style={styles.statusIndicator}>
            <Text style={styles.statusText}>😔 No friends online nearby</Text>
          </View>
        )}

        {myPickupRequest && (
          <View
            style={[
              styles.statusIndicator,
              myPickupRequest.status === "pending"
                ? styles.pendingStatus
                : styles.acceptedStatus,
            ]}
          >
            <Text style={styles.statusText}>
              {myPickupRequest.status === "pending"
                ? "🤚 Waiting for pickup..."
                : `✅ ${myPickupRequest.acceptedByName} will pick you up!`}
            </Text>
            {myPickupRequest.status === "pending" && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={cancelPickupRequest}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Event cards */}
      <View style={styles.cardContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardScrollContent}
          decelerationRate="fast"
          snapToInterval={width * 0.65 + 12}
          snapToAlignment="start"
        >
          {events.map((event, index) => {
            const isJoined = joinedEvents.some((e) => e.id === event.id);
            const hasMyRequest = myPickupRequest?.eventId === event.id;

            return (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>
                      {event.location_name}
                    </Text>
                  </View>
                  {event.start_at && (
                    <Text style={styles.cardTimeText}>
                      {formatTimeUntil(event.start_at)}
                    </Text>
                  )}
                </View>

                <Text style={styles.cardTitle} numberOfLines={2}>
                  {event.name}
                </Text>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={() => showEventRoutes(event)}
                  >
                    <Text style={styles.smallButtonText}>📍</Text>
                  </TouchableOpacity>

                  {isJoined && !hasMyRequest && (
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() => requestPickup(event)}
                    >
                      <Text style={styles.smallButtonText}>🚗</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.joinButton, isJoined && styles.joinedButton]}
                    onPress={() => toggleEventJoin(event)}
                  >
                    <Text style={styles.joinButtonText}>
                      {isJoined ? "✓" : "Join"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Routes Modal */}
      <Modal
        visible={showRoutesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRoutesModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{selectedEvent?.name}</Text>
              <Text style={styles.modalSubtitle}>Route Analysis</Text>
            </View>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowRoutesModal(false)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isCalculatingRoutes ? (
            <View style={styles.calculatingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.calculatingText}>
                Calculating accurate routes...
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.modalContent}>
              {/* User route */}
              {routeData.user && (
                <View style={styles.routeSection}>
                  <Text style={styles.routeSectionTitle}>Your Route</Text>
                  <View style={styles.routeItem}>
                    <View style={styles.routeInfo}>
                      <View
                        style={[
                          styles.routeColorIndicator,
                          { backgroundColor: "#007AFF" },
                        ]}
                      />
                      <Text style={styles.routeName}>You 📍</Text>
                    </View>
                    <View style={styles.routeStats}>
                      <Text style={styles.routeTime}>
                        {formatDuration(routeData.user.duration)}
                      </Text>
                      <Text style={styles.routeDistance}>
                        {routeData.user.distance} km
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Friends routes */}
              {Object.keys(routeData).filter((key) => key !== "user").length >
                0 && (
                <View style={styles.routeSection}>
                  <Text style={styles.routeSectionTitle}>Friends' Routes</Text>
                  {Object.entries(routeData)
                    .filter(([key]) => key !== "user")
                    .sort(([, a], [, b]) => a.duration - b.duration)
                    .map(([friendId, route], index) => {
                      const friend = friends.find((f) => f.id === friendId);
                      if (!friend) return null;

                      return (
                        <View key={friendId} style={styles.routeItem}>
                          <View style={styles.routeInfo}>
                            <View
                              style={[
                                styles.routeColorIndicator,
                                {
                                  backgroundColor: getRouteColor(
                                    friendId,
                                    index
                                  ),
                                },
                              ]}
                            />
                            <View style={styles.friendRouteInfo}>
                              <View style={styles.friendRouteAvatar}>
                                {friend.avatar &&
                                friend.avatar.startsWith("http") ? (
                                  <Image
                                    source={{ uri: friend.avatar }}
                                    style={styles.routeFriendImage}
                                  />
                                ) : (
                                  <Text style={styles.routeFriendInitial}>
                                    {friend.name.charAt(0).toUpperCase()}
                                  </Text>
                                )}
                              </View>
                              <Text style={styles.routeName}>
                                {friend.name}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.routeStats}>
                            <Text style={styles.routeTime}>
                              {formatDuration(route.duration)}
                            </Text>
                            <Text style={styles.routeDistance}>
                              {route.distance} km
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                </View>
              )}

              {!routeData.user &&
                Object.keys(routeData).filter((key) => key !== "user")
                  .length === 0 && (
                  <View style={styles.emptyRoutesContainer}>
                    <Text style={styles.emptyRoutesText}>
                      Join the event to see your route and coordinate with
                      friends!
                    </Text>
                  </View>
                )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Pickup Requests Modal */}
      <Modal
        visible={showPickupModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPickupModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Pickup Requests</Text>
              <Text style={styles.modalSubtitle}>
                Help friends get to events
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowPickupModal(false)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {pickupRequests
              .filter(
                (req) => req.status === "pending" && req.requesterId !== userId
              )
              .map((request) => {
                const event = events.find((e) => e.id === request.eventId);
                if (!event) return null;

                return (
                  <View key={request.id} style={styles.pickupRequestCard}>
                    <View style={styles.pickupRequestHeader}>
                      <View style={styles.pickupRequestInfo}>
                        <Text style={styles.pickupRequestName}>
                          {request.requesterName}
                        </Text>
                        <Text style={styles.pickupRequestEvent}>
                          {request.eventName}
                        </Text>
                      </View>
                      <Text style={styles.pickupRequestTime}>
                        {new Date(request.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>

                    <Text style={styles.pickupRequestDescription}>
                      Needs a ride to {event.location_name}
                    </Text>

                    <View style={styles.pickupRequestActions}>
                      <TouchableOpacity
                        style={styles.acceptPickupButton}
                        onPress={() => {
                          acceptPickupRequest(request);
                          setShowPickupModal(false);
                        }}
                      >
                        <Text style={styles.acceptPickupButtonText}>
                          ✓ Offer Ride
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.declinePickupButton}
                        onPress={() => {
                          setPickupRequests((prev) =>
                            prev.map((req) =>
                              req.id === request.id
                                ? { ...req, status: "declined" as const }
                                : req
                            )
                          );
                        }}
                      >
                        <Text style={styles.declinePickupButtonText}>
                          ✕ Decline
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

            {pickupRequests.filter(
              (req) => req.status === "pending" && req.requesterId !== userId
            ).length === 0 && (
              <View style={styles.emptyPickupContainer}>
                <Text style={styles.emptyPickupText}>
                  🚗 No pickup requests at the moment
                </Text>
                <Text style={styles.emptyPickupSubtext}>
                  When friends need rides to events, they'll appear here!
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  map: {
    flex: 1,
  },
  // Loading states
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  errorText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#EF4444",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  // Control buttons
  controlButtons: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  controlButtonText: {
    fontSize: 20,
  },
  pickupButton: {
    position: "relative",
  },
  notificationBadge: {
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
  notificationBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
  // Status indicators
  statusIndicators: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 100,
    zIndex: 10,
  },
  statusIndicator: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  statusText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  pendingStatus: {
    backgroundColor: "white",
    borderWidth: 1,
  },
  acceptedStatus: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  cancelButton: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  cancelButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  // Event cards
  cardContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingBottom: 40,
  },
  cardScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  eventCard: {
    width: width * 0.65,
    marginRight: 12,
    borderRadius: 16,
    backgroundColor: "white",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cardBadgeText: {
    color: "#3B82F6",
    fontSize: 10,
    fontWeight: "600",
  },
  cardTimeText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  smallButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  smallButtonText: {
    fontSize: 16,
  },
  joinButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
  },
  joinedButton: {
    backgroundColor: "#10B981",
  },
  joinButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  // Enhanced custom markers
  markerContainer: {
    alignItems: "center",
  },
  markerPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  markerIcon: {
    fontSize: 20,
  },
  // Event markers
  eventPin: {
    backgroundColor: "#3B82F6",
  },
  joinedEventPin: {
    backgroundColor: "#10B981",
  },
  // Enhanced friend markers
  friendMarkerPin: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "white",
    backgroundColor: "#6366F1",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    position: "relative",
  },
  offeringFriendPin: {
    backgroundColor: "#F59E0B",
    borderColor: "#FEF3C7",
  },
  friendAvatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  friendAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
  },
  friendInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
  },
  carBadge: {
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
    borderColor: "white",
  },
  carIcon: {
    fontSize: 10,
  },
  // User markers
  userMarkerPin: {},
  needsRidePin: {
    backgroundColor: "#EF4444",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "600",
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  // Route modal content
  calculatingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  calculatingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  routeSection: {
    marginBottom: 24,
  },
  routeSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 12,
  },
  routeItem: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  routeInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  routeColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  routeName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1F2937",
  },
  friendRouteInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  friendRouteAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    overflow: "hidden",
  },
  routeFriendImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  routeFriendInitial: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  routeStats: {
    alignItems: "flex-end",
  },
  routeTime: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  routeDistance: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  emptyRoutesContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyRoutesText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
  },
  // Pickup modal content
  pickupRequestCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  pickupRequestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  pickupRequestInfo: {
    flex: 1,
  },
  pickupRequestName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  pickupRequestEvent: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  pickupRequestTime: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  pickupRequestDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
    lineHeight: 20,
  },
  pickupRequestActions: {
    flexDirection: "row",
    gap: 12,
  },
  acceptPickupButton: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
  },
  acceptPickupButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  declinePickupButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
  },
  declinePickupButtonText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyPickupContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyPickupText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyPickupSubtext: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
});
