import type { ProviderKind } from "./types";

const providerTerms = [
  "doctor",
  "physician",
  "primary care",
  "pcp",
  "dentist",
  "dental",
  "dermatologist",
  "cardiologist",
  "pediatrician",
  "therapist",
  "clinic",
  "specialist",
];

const actionTerms = [
  "appointment",
  "book",
  "call",
  "find",
  "lookup",
  "look up",
  "phone",
  "number",
  "schedule",
  "provider",
  "office",
];

export function isProviderLookupTask(title: string, notes = ""): boolean {
  const text = `${title} ${notes}`.toLowerCase();
  return (
    providerTerms.some((term) => text.includes(term)) &&
    actionTerms.some((term) => text.includes(term))
  );
}

export function inferProviderKind(title: string, notes = ""): ProviderKind {
  const text = `${title} ${notes}`.toLowerCase();
  return text.includes("dentist") || text.includes("dental") ? "dentist" : "doctor";
}
