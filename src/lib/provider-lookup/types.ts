export type ProviderKind = "doctor" | "dentist";
export type LookupSource = "google_maps" | "web_search";

export type ProviderProfile = {
  id: string;
  name: string;
  kind: ProviderKind;
  specialty: string;
  services: string[];
  address: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  distanceMilesFromSampleCenter: number;
  phone: string;
  website: string;
  insuranceAccepted: string[];
  acceptingNewPatients: boolean;
  languages: string[];
  accessibility: string[];
  telehealth: boolean;
  nextAvailable: string;
  rating: number;
  reviewCount: number;
  notes: string;
};

export type ProviderLookupRequest = {
  location: string;
  providerKind: ProviderKind;
  service: string;
  maxDistanceMiles: number;
  lookupSource?: LookupSource;
  insurance?: string;
  acceptingNewPatientsOnly?: boolean;
  language?: string;
  accessibilityNeed?: string;
  telehealthPreferred?: boolean;
  preferredAvailability?: string;
  urgency?: "routine" | "soon" | "urgent";
  otherFactors?: string;
};

export type ProviderRecommendation = {
  name: string;
  kind: ProviderKind;
  specialty: string;
  address: string;
  phone: string;
  website: string;
  distanceMiles: number;
  nextAvailable: string;
  acceptsInsurance: string;
  acceptingNewPatients: string;
  rating: number;
  reviewCount: number;
  sourceUrls: string[];
  reasons: string[];
  cautions: string[];
};

export type ProviderLookupOutput = {
  summary: string;
  lookupSource: "google_maps" | "web_search" | "sample_directory";
  recommendations: ProviderRecommendation[];
  questionsToAskOffice: string[];
  missingInformation: string[];
  warnings: string[];
  safetyNote: string;
};
