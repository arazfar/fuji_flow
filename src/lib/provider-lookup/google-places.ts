import type { ProviderKind, ProviderLookupRequest, ProviderRecommendation } from "./types";

type GooglePlaceProviderMatch = ProviderRecommendation & {
  googleMapsUri: string;
};

type GeocodeResponse = {
  status: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
  error_message?: string;
};

type PlacesSearchResponse = {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
    rating?: number;
    userRatingCount?: number;
  }>;
  error?: {
    message?: string;
  };
};

const metersPerMile = 1609.344;

function getGoogleMapsApiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
}

export function hasGooglePlacesConfig(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function milesBetween(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): number {
  const earthRadiusMiles = 3958.7613;
  const deltaLat = toRadians(end.latitude - start.latitude);
  const deltaLon = toRadians(end.longitude - start.longitude);
  const startLat = toRadians(start.latitude);
  const endLat = toRadians(end.latitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLon / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildTextQuery(criteria: ProviderLookupRequest): string {
  const providerTerm: ProviderKind =
    criteria.providerKind === "dentist" ? "dentist" : "doctor";
  return `${criteria.service} ${providerTerm} near ${criteria.location}`;
}

async function geocodeLocation(location: string, apiKey: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", location);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const payload = (await response.json()) as GeocodeResponse;

  if (!response.ok || payload.status !== "OK") {
    throw new Error(
      payload.error_message || `Google Geocoding failed with status ${payload.status}`,
    );
  }

  const coordinates = payload.results?.[0]?.geometry?.location;
  if (!coordinates) {
    throw new Error("Google Geocoding did not return coordinates for the requested location.");
  }

  return {
    latitude: coordinates.lat,
    longitude: coordinates.lng,
  };
}

export async function searchGooglePlaces(
  criteria: ProviderLookupRequest,
): Promise<GooglePlaceProviderMatch[]> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }

  const center = await geocodeLocation(criteria.location, apiKey);
  const radiusMeters = Math.min(criteria.maxDistanceMiles * metersPerMile, 50_000);

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.googleMapsUri",
        "places.rating",
        "places.userRatingCount",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: buildTextQuery(criteria),
      maxResultCount: 8,
      locationBias: {
        circle: {
          center,
          radius: radiusMeters,
        },
      },
    }),
  });

  const payload = (await response.json()) as PlacesSearchResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google Places failed with status ${response.status}`);
  }

  return (payload.places ?? [])
    .map((place) => {
      const placeLocation =
        typeof place.location?.latitude === "number" &&
        typeof place.location?.longitude === "number"
          ? { latitude: place.location.latitude, longitude: place.location.longitude }
          : undefined;
      const distanceMiles = placeLocation ? milesBetween(center, placeLocation) : 0;

      return {
        name: place.displayName?.text ?? "Unnamed provider",
        kind: criteria.providerKind,
        specialty: criteria.service,
        address: place.formattedAddress ?? "Address unavailable",
        phone:
          place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? "Phone unavailable",
        website: place.websiteUri ?? place.googleMapsUri ?? "",
        distanceMiles: Number(distanceMiles.toFixed(1)),
        nextAvailable: "Verify with office",
        acceptsInsurance: criteria.insurance
          ? `Verify ${criteria.insurance}`
          : "Insurance not specified",
        acceptingNewPatients: "Verify with office",
        rating: place.rating ?? 0,
        reviewCount: place.userRatingCount ?? 0,
        googleMapsUri: place.googleMapsUri ?? "",
        sourceUrls: [place.googleMapsUri, place.websiteUri].filter(
          (url): url is string => Boolean(url),
        ),
        reasons: [
          `Matched Google Places query for ${criteria.service} ${criteria.providerKind}.`,
          placeLocation
            ? `${distanceMiles.toFixed(1)} miles from ${criteria.location}.`
            : "Google did not return coordinates for this place.",
        ],
        cautions: [
          "Google Places does not verify insurance network status.",
          "Accepting-new-patient status and appointment availability must be confirmed with the office.",
        ],
      };
    })
    .filter((match) => match.distanceMiles === 0 || match.distanceMiles <= criteria.maxDistanceMiles)
    .sort((a, b) => {
      const ratingDelta = b.rating - a.rating;
      if (ratingDelta !== 0) return ratingDelta;
      return a.distanceMiles - b.distanceMiles;
    })
    .slice(0, 5);
}
