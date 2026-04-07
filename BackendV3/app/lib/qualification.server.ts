import { z } from "zod";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "msn.com"
]);
const EmailSchema = z.string().email();

export type IcpFit = "match" | "no_match" | "unknown";

export interface QualificationStateInput {
  email?: string | null;
  companyDomain?: string | null;
  useCase?: string | null;
  role?: string | null;
  authorityConfirmed?: boolean | null;
  icpFit?: string | null;
}

export interface QualificationState {
  companyDomain: string | null;
  useCase: string | null;
  icpFit: IcpFit;
  authorityConfirmed: boolean;
  qualificationScore: number;
  bookingEligible: boolean;
  missingFields: string[];
}

function normalizeString(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDomain(value?: string | null) {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return null;
  return normalized.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
}

export function extractBusinessDomain(email?: string | null) {
  const normalized = normalizeString(email)?.toLowerCase();
  if (!normalized) return null;

  const parsedEmail = EmailSchema.safeParse(normalized);
  if (!parsedEmail.success) return null;

  const domain = parsedEmail.data.split("@").pop() ?? null;
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function inferAuthorityFromRole(role?: string | null) {
  const normalized = normalizeString(role)?.toLowerCase();
  if (!normalized) return false;
  return /founder|co-founder|owner|chief|ceo|cmo|cto|cro|coo|president|vp|vice president|head|director|gm|general manager/i.test(
    normalized
  );
}

export function normalizeIcpFit(value?: string | null): IcpFit {
  const normalized = normalizeString(value)?.toLowerCase();
  if (normalized === "match" || normalized === "yes" || normalized === "true") return "match";
  if (normalized === "no_match" || normalized === "no-match" || normalized === "no" || normalized === "false") {
    return "no_match";
  }
  return "unknown";
}

export function computeQualificationState(input: QualificationStateInput): QualificationState {
  const companyDomain = normalizeDomain(input.companyDomain) ?? extractBusinessDomain(input.email);
  const useCase = normalizeString(input.useCase);
  const icpFit = normalizeIcpFit(input.icpFit);
  const authorityConfirmed = Boolean(input.authorityConfirmed ?? inferAuthorityFromRole(input.role));

  const missingFields: string[] = [];
  let score = 0;

  if (companyDomain) {
    score += 0.25;
  } else {
    missingFields.push("companyDomain");
  }

  if (useCase) {
    score += 0.25;
  } else {
    missingFields.push("useCase");
  }

  if (icpFit === "match") {
    score += 0.25;
  } else {
    missingFields.push("icpMatch");
  }

  if (authorityConfirmed) {
    score += 0.25;
  } else {
    missingFields.push("authority");
  }

  return {
    companyDomain,
    useCase,
    icpFit,
    authorityConfirmed,
    qualificationScore: Number(score.toFixed(2)),
    bookingEligible: Boolean(companyDomain && useCase && icpFit === "match" && authorityConfirmed),
    missingFields
  };
}
