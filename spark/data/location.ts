// data/location.ts
import { Platform } from "react-native";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";

type Coords = {
  latitude: number;
  longitude: number;
  accuracy: number | null; // <-- normalize to null to avoid TS mismatch
};

async function upsertUserLocation(userId: string, coords: Coords) {
  await supabase.from("user_locations").upsert(
    {
      user_id: userId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy, // can be null
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

/**
 * Ask for location permission and persist result.
 * - If granted → save real coords + profiles.location_enabled = true
 * - If denied/error → save zeros + profiles.location_enabled = false
 */
export async function askAndPersistLocation(userId: string) {
  try {
    let coords: Coords | null = null;

    if (Platform.OS === "web") {
      if (!("geolocation" in navigator)) throw new Error("Geolocation not supported");
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
      coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
      };
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? null, // <-- normalize here
        };
      }
    }

    if (coords) {
      await upsertUserLocation(userId, coords);
      await supabase.from("profiles").update({ location_enabled: true }).eq("id", userId);
      return { allowed: true as const, coords };
    }

    // treat as denied if no coords
    await upsertUserLocation(userId, { latitude: 0, longitude: 0, accuracy: null });
    await supabase.from("profiles").update({ location_enabled: false }).eq("id", userId);
    return { allowed: false as const };
  } catch {
    // on error, also treat as denied
    await upsertUserLocation(userId, { latitude: 0, longitude: 0, accuracy: null });
    await supabase.from("profiles").update({ location_enabled: false }).eq("id", userId);
    return { allowed: false as const };
  }
}

/** Explicitly disable and zero out location */
export async function disableLocation(userId: string) {
  await upsertUserLocation(userId, { latitude: 0, longitude: 0, accuracy: null });
  await supabase.from("profiles").update({ location_enabled: false }).eq("id", userId);
}
