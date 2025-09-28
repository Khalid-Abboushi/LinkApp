// lib/geocode.ts
export async function geocodeAddress(address: string, apiKey: string) {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
    address
  )}&limit=1&apiKey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const data = await res.json();
  const f = data?.features?.[0];
  if (!f) throw new Error("No geocode results");

  const [lng, lat] = f.geometry?.coordinates ?? [];
  const label =
    f.properties?.formatted ||
    f.properties?.address_line1 ||
    address;

  return { lat: Number(lat), lng: Number(lng), label };
}
