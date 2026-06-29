import { hasGooglePlacesConfig, searchGooglePlaces } from "./google-places";
import { providerDirectory } from "./providers";
import type {
  ProviderLookupOutput,
  ProviderLookupRequest,
  ProviderProfile,
  ProviderRecommendation,
} from "./types";

type ProviderMatch = {
  provider: ProviderProfile;
  score: number;
  reasons: string[];
  cautions: string[];
};

const lower = (value = "") => value.trim().toLowerCase();

function includesLoose(values: string[], needle?: string): boolean {
  const query = lower(needle);
  if (!query) return true;
  return values.some((value) => lower(value).includes(query) || query.includes(lower(value)));
}

function dateScore(dateText: string): number {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 0;
  const days = Math.max(0, (date.getTime() - Date.now()) / 86_400_000);
  return Math.max(0, 12 - Math.min(days, 12));
}

function searchSampleProviders(criteria: ProviderLookupRequest): ProviderMatch[] {
  const serviceQuery = lower(criteria.service);
  const insuranceQuery = lower(criteria.insurance);
  const languageQuery = lower(criteria.language);
  const accessibilityQuery = lower(criteria.accessibilityNeed);

  return providerDirectory
    .filter((provider) => provider.kind === criteria.providerKind)
    .filter((provider) => provider.distanceMilesFromSampleCenter <= criteria.maxDistanceMiles)
    .filter((provider) => !criteria.acceptingNewPatientsOnly || provider.acceptingNewPatients)
    .map((provider) => {
      let score = 0;
      const reasons: string[] = [];
      const cautions: string[] = [];
      const serviceMatched =
        includesLoose(provider.services, serviceQuery) ||
        lower(provider.specialty).includes(serviceQuery);

      if (serviceMatched) {
        score += 30;
        reasons.push(`Matches ${criteria.service} through ${provider.specialty}.`);
      } else {
        cautions.push(`Service match is indirect; listed services are ${provider.services.join(", ")}.`);
      }

      score += Math.max(0, 20 - provider.distanceMilesFromSampleCenter * 2);
      reasons.push(`${provider.distanceMilesFromSampleCenter.toFixed(1)} miles from the sample search center.`);

      if (insuranceQuery) {
        if (includesLoose(provider.insuranceAccepted, insuranceQuery)) {
          score += 18;
          reasons.push(`Accepts ${criteria.insurance}.`);
        } else {
          score -= 20;
          cautions.push(`Insurance needs verification; listed plans are ${provider.insuranceAccepted.join(", ")}.`);
        }
      }

      if (provider.acceptingNewPatients) {
        score += 12;
        reasons.push("Accepting new patients.");
      } else {
        score -= 25;
        cautions.push("Not currently accepting new patients.");
      }

      if (languageQuery) {
        if (includesLoose(provider.languages, languageQuery)) {
          score += 8;
          reasons.push(`Offers care in ${criteria.language}.`);
        } else {
          cautions.push(`Language preference not listed; languages are ${provider.languages.join(", ")}.`);
        }
      }

      if (accessibilityQuery) {
        if (includesLoose(provider.accessibility, accessibilityQuery)) {
          score += 8;
          reasons.push(`Meets accessibility preference: ${criteria.accessibilityNeed}.`);
        } else {
          cautions.push("Accessibility need should be confirmed by phone.");
        }
      }

      if (criteria.telehealthPreferred) {
        if (provider.telehealth) {
          score += 6;
          reasons.push("Offers telehealth.");
        } else {
          cautions.push("No telehealth listed.");
        }
      }

      score += provider.rating;
      score += dateScore(provider.nextAvailable);

      if (criteria.urgency === "urgent" && new Date(provider.nextAvailable) > new Date("2026-07-05")) {
        cautions.push("Availability may be too slow for an urgent need.");
      }

      return { provider, score, reasons, cautions };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function sampleRecommendations(criteria: ProviderLookupRequest): ProviderRecommendation[] {
  return searchSampleProviders(criteria).map((match) => ({
    name: match.provider.name,
    kind: match.provider.kind,
    specialty: match.provider.specialty,
    address: `${match.provider.address}, ${match.provider.city}, ${match.provider.state} ${match.provider.postalCode}`,
    phone: match.provider.phone,
    website: match.provider.website,
    distanceMiles: match.provider.distanceMilesFromSampleCenter,
    nextAvailable: match.provider.nextAvailable,
    acceptsInsurance: criteria.insurance
      ? includesLoose(match.provider.insuranceAccepted, criteria.insurance)
        ? `Accepts ${criteria.insurance}`
        : `Verify ${criteria.insurance}`
      : "Insurance not specified",
    acceptingNewPatients: match.provider.acceptingNewPatients
      ? "Accepting new patients"
      : "Not accepting new patients",
    rating: match.provider.rating,
    reviewCount: match.provider.reviewCount,
    sourceUrls: [match.provider.website].filter(Boolean),
    reasons: match.reasons,
    cautions: match.cautions,
  }));
}

export async function lookupProviders(
  criteria: ProviderLookupRequest,
): Promise<ProviderLookupOutput> {
  const warnings: string[] = [];
  let lookupSource: ProviderLookupOutput["lookupSource"] = "sample_directory";
  let recommendations: ProviderRecommendation[];

  if (criteria.lookupSource !== "web_search" && hasGooglePlacesConfig()) {
    try {
      recommendations = await searchGooglePlaces(criteria);
      lookupSource = "google_maps";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Places lookup failed.";
      warnings.push(`Google Places lookup failed, so sample data was used instead: ${message}`);
      recommendations = sampleRecommendations(criteria);
    }
  } else {
    if (criteria.lookupSource === "web_search") {
      warnings.push("Live web search needs OPENAI_API_KEY; sample data was used in this local lookup.");
    } else {
      warnings.push("GOOGLE_MAPS_API_KEY is not configured, so sample data was used.");
    }
    recommendations = sampleRecommendations(criteria);
  }

  const missingInformation = [
    criteria.insurance ? undefined : "Insurance plan",
    criteria.preferredAvailability ? undefined : "Preferred appointment window",
  ].filter((value): value is string => Boolean(value));

  return {
    summary: recommendations.length
      ? `Found ${recommendations.length} ${criteria.providerKind} option${recommendations.length === 1 ? "" : "s"} for ${criteria.service}.`
      : `No matching ${criteria.providerKind} options were found in the configured lookup source.`,
    lookupSource,
    recommendations,
    questionsToAskOffice: [
      "Are you accepting new patients?",
      criteria.insurance
        ? `Do you accept ${criteria.insurance}, and is this visit in network?`
        : "Which insurance plans do you accept?",
      "What is the earliest available appointment?",
      "Do I need a referral, records, forms, or imaging before the visit?",
    ],
    missingInformation,
    warnings,
    safetyNote:
      "This is provider lookup support, not medical advice. For urgent or severe symptoms, contact emergency services or urgent care.",
  };
}
