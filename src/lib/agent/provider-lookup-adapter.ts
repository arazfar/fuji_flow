import { Agent, run, webSearchTool, type NonStreamRunOptions } from "@openai/agents";
import { z } from "zod";

import { lookupProviders } from "@/lib/provider-lookup/search";
import type {
  LookupSource,
  ProviderKind,
  ProviderLookupOutput,
  ProviderLookupRequest,
} from "@/lib/provider-lookup/types";
import { inferProviderKind } from "@/lib/provider-lookup/intent";

import type {
  ActionPlan,
  AdapterMode,
  AgentRunRecord,
  ContextQuestion,
  TaskOutcome,
} from "./types";

const webSearchRunOptions = {
  maxTurns: 6,
} satisfies NonStreamRunOptions;

const providerRecommendationSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["doctor", "dentist"]),
  specialty: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().min(1),
  website: z.string(),
  distanceMiles: z.number(),
  nextAvailable: z.string().min(1),
  acceptsInsurance: z.string().min(1),
  acceptingNewPatients: z.string().min(1),
  rating: z.number(),
  reviewCount: z.number(),
  sourceUrls: z.array(z.string().url()),
  reasons: z.array(z.string().min(1)),
  cautions: z.array(z.string().min(1)),
});

const providerLookupOutputSchema = z.object({
  summary: z.string().min(1),
  lookupSource: z.enum(["google_maps", "web_search", "sample_directory"]),
  recommendations: z.array(providerRecommendationSchema),
  questionsToAskOffice: z.array(z.string().min(1)),
  missingInformation: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  safetyNote: z.string().min(1),
});

function modelConfig() {
  return process.env.OPENAI_MODEL ? { model: process.env.OPENAI_MODEL } : {};
}

export class ProviderLookupAdapter {
  readonly workflowKind = "provider_lookup" as const;

  constructor(readonly mode: AdapterMode) {}

  async generateContextQuestions(
    task: AgentRunRecord["task"],
  ): Promise<ContextQuestion[]> {
    const providerKind = inferProviderKind(task.title, task.notes);

    return [
      {
        id: "location",
        label: "Where should the agent search?",
        helpText: "City, ZIP code, neighborhood, or address.",
        placeholder: "Example: San Francisco, CA or 94103",
        type: "short",
        required: true,
      },
      {
        id: "service",
        label: `What kind of ${providerKind} or service do you need?`,
        placeholder:
          providerKind === "dentist"
            ? "Example: cleaning, tooth pain, pediatric dentist"
            : "Example: primary care, dermatologist, annual physical",
        type: "short",
        required: true,
      },
      {
        id: "insurance",
        label: "Insurance plan, if any",
        placeholder: "Example: Aetna, Delta Dental, Medicare",
        type: "short",
        required: false,
      },
      {
        id: "preferences",
        label: "Any preferences or constraints?",
        helpText:
          "Distance, language, accessibility, telehealth, availability, or new-patient needs.",
        placeholder: "Example: within 10 miles, Spanish, accepting new patients",
        type: "long",
        required: false,
      },
      {
        id: "urgency",
        label: "How urgent is this?",
        placeholder: "routine, soon, or urgent",
        type: "short",
        required: false,
      },
    ];
  }

  async createPlan(
    run: AgentRunRecord,
    answers: Record<string, string>,
  ): Promise<ActionPlan> {
    const criteria = criteriaFromRun(run, answers);
    const source =
      criteria.lookupSource === "google_maps"
        ? "Google Places when configured, with sample directory fallback"
        : "live web search";

    return {
      summary: `Find ${criteria.providerKind} options for ${criteria.service} near ${criteria.location}.`,
      feasibility: "needs_user_action",
      estimatedEffort: "2-5 minutes",
      requiresCurrentInfo: true,
      riskLevel: "medium",
      approvalPrompt:
        "Approve this lookup to shortlist provider options and prepare call-ready next steps. The agent will not book an appointment or give medical advice.",
      steps: [
        {
          id: "search",
          title: "Search provider options",
          detail: `Use ${source} for providers matching the location, service, and preferences.`,
          owner: "agent",
        },
        {
          id: "rank",
          title: "Rank practical fit",
          detail:
            "Prioritize service match, distance, contactability, insurance clues, accepting-new-patient status, and availability warnings.",
          owner: "agent",
        },
        {
          id: "handoff",
          title: "Prepare appointment handoff",
          detail:
            "Return phone numbers, links, verification questions, and what to ask before booking.",
          owner: "user",
        },
      ],
    };
  }

  async executeApprovedPlan(run: AgentRunRecord): Promise<{ outcome: TaskOutcome }> {
    const criteria = criteriaFromRun(run, run.contextAnswers);
    const lookup =
      criteria.lookupSource === "web_search" && this.mode === "live"
        ? await lookupProvidersWithWebSearch(criteria)
        : await lookupProviders(criteria);

    return {
      outcome: providerLookupToOutcome(lookup),
    };
  }
}

function criteriaFromRun(
  run: AgentRunRecord,
  answers: Record<string, string>,
): ProviderLookupRequest {
  const providerKind = inferProviderKind(run.task.title, run.task.notes);
  const preferences = answers.preferences ?? "";

  return {
    location: answers.location?.trim() || "San Francisco, CA",
    providerKind,
    service: answers.service?.trim() || defaultService(providerKind, run),
    maxDistanceMiles: distanceFromPreferences(preferences),
    lookupSource: lookupSourceFromPreferences(preferences) ?? "web_search",
    insurance: optional(answers.insurance),
    acceptingNewPatientsOnly: /accepting new|new patient/i.test(preferences) || undefined,
    language: matchPreference(preferences, /(?:language|speaks?|spanish|mandarin|cantonese|korean|tagalog)[^,.]*/i),
    accessibilityNeed: matchPreference(preferences, /(?:wheelchair|accessible|accessibility|parking|transit)[^,.]*/i),
    telehealthPreferred: /telehealth|virtual|video/i.test(preferences) || undefined,
    preferredAvailability: matchPreference(preferences, /(?:available|availability|appointment|morning|afternoon|evening|weekend)[^,.]*/i),
    urgency: urgencyFromAnswer(answers.urgency || preferences),
    otherFactors: optional(preferences),
  };
}

function defaultService(providerKind: ProviderKind, run: AgentRunRecord): string {
  const text = `${run.task.title} ${run.task.notes ?? ""}`.toLowerCase();
  if (text.includes("dermat")) return "dermatology";
  if (text.includes("cardio")) return "cardiology";
  if (text.includes("pediatric")) return providerKind === "dentist" ? "pediatric dentistry" : "pediatrics";
  if (text.includes("tooth") || text.includes("root canal")) return "tooth pain";
  return providerKind === "dentist" ? "dental exam" : "primary care";
}

function distanceFromPreferences(preferences: string): number {
  const match = preferences.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)/i);
  if (!match) return 10;
  const distance = Number(match[1]);
  return Number.isFinite(distance) ? Math.min(Math.max(distance, 1), 100) : 10;
}

function lookupSourceFromPreferences(preferences: string): LookupSource | undefined {
  if (/web search|live search/i.test(preferences)) return "web_search";
  if (/google|maps/i.test(preferences)) return "google_maps";
  return undefined;
}

async function lookupProvidersWithWebSearch(
  criteria: ProviderLookupRequest,
): Promise<ProviderLookupOutput> {
  const agent = new Agent({
    name: "Doctor and Dentist Web Search Agent",
    ...modelConfig(),
    instructions: `
You help people shortlist doctors or dentists using live web search.

Use web search to find current provider options for the requested location, service, distance, and preferences. Prefer official provider websites, hospital or clinic pages, reputable directories, and listing pages with phone/address details. Do not invent phone numbers, addresses, ratings, insurance participation, accepting-new-patient status, or availability.

Return structured recommendations only when you found evidence online. Put URLs you used in sourceUrls. Use "Verify with office" for nextAvailable and acceptingNewPatients unless a source clearly says otherwise. Use "Verify <plan>" for acceptsInsurance when insurance is requested unless a source specifically confirms the plan.

Rank by service match, proximity to the requested location, evidence quality, practical contactability, and user preferences. Add warnings when web search cannot verify insurance, distance, availability, accepting-new-patient status, accessibility, or language.

For urgent symptoms, severe pain, trouble breathing, chest pain, neurological symptoms, uncontrolled bleeding, facial swelling, or dental trauma, advise urgent care, emergency services, or the user's local emergency number instead of treating provider lookup as medical advice.
`,
    tools: [
      webSearchTool({
        searchContextSize: "medium",
        externalWebAccess: true,
      }),
    ],
    outputType: providerLookupOutputSchema,
  });

  const result = await run(
    agent,
    `Find provider options for this request:\n${JSON.stringify(criteria, null, 2)}`,
    webSearchRunOptions,
  );

  if (!result.finalOutput) {
    throw new Error("The provider web search agent did not return lookup results.");
  }

  return {
    ...result.finalOutput,
    lookupSource: "web_search",
  };
}

function urgencyFromAnswer(value: string): ProviderLookupRequest["urgency"] {
  if (/urgent|asap|today|emergency/i.test(value)) return "urgent";
  if (/soon|week|quick/i.test(value)) return "soon";
  if (/routine|whenever|not urgent/i.test(value)) return "routine";
  return undefined;
}

function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function matchPreference(preferences: string, pattern: RegExp): string | undefined {
  return preferences.match(pattern)?.[0]?.trim();
}

function providerLookupToOutcome(lookup: ProviderLookupOutput): TaskOutcome {
  const citations = new Map<string, string>();

  const nextSteps: TaskOutcome["nextSteps"] = lookup.recommendations.map((provider) => {
    for (const url of provider.sourceUrls) {
      citations.set(url, provider.name);
    }

    return {
      title: provider.name,
      detail: [
        `${provider.specialty} at ${provider.address}.`,
        provider.reasons.slice(0, 2).join(" "),
        provider.cautions.length ? `Verify: ${provider.cautions[0]}` : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      link: provider.website || provider.sourceUrls[0],
      phone: provider.phone,
      deadline: provider.nextAvailable,
      materials: [
        provider.acceptsInsurance,
        provider.acceptingNewPatients,
        `${provider.rating.toFixed(1)} rating from ${provider.reviewCount} reviews`,
      ],
    };
  });

  if (lookup.questionsToAskOffice.length) {
    nextSteps.push({
      title: "Call script checklist",
      detail: lookup.questionsToAskOffice.join(" "),
      materials: lookup.missingInformation.length
        ? lookup.missingInformation
        : ["Insurance card", "Preferred appointment times", "Reason for visit"],
    });
  }

  return {
    status: "needs_user_action",
    summary: [
      lookup.summary,
      lookup.warnings.join(" "),
      lookup.safetyNote,
    ]
      .filter(Boolean)
      .join(" "),
    completedActions: [
      `Ran the provider lookup using ${lookup.lookupSource.replace("_", " ")}.`,
      "Prepared provider options and phone-ready verification questions.",
    ],
    nextSteps,
    citations: [...citations.entries()].map(([url, title]) => ({ title, url })),
  };
}
