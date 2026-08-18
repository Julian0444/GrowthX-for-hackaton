import type { CampaignDraft } from '@/lib/contracts/growxth';
import type { TeracRun } from '@/lib/server/research/store';

const TERAC_BASE_URL = 'https://terac.com/api/external/v2';
const PROJECT_NAME = 'GrowXth Campaign Validation';
const REQUEST_TIMEOUT_MS = 10000;

interface TeracRequestResult {
  ok: boolean;
  status: number;
  body: unknown;
  error?: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function apiError(body: unknown, fallback: string): string {
  const object = record(body);
  return stringValue(object?.message) ?? stringValue(record(object?.error)?.message) ?? fallback;
}

async function teracRequest(path: string, init: RequestInit = {}): Promise<TeracRequestResult> {
  const apiKey = process.env.TERAC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: 'TERAC_API_KEY is not configured.',
    };
  }
  try {
    const response = await fetch(`${TERAC_BASE_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...init.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok
        ? undefined
        : apiError(body, `Terac returned HTTP ${response.status}.`),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : 'Terac request failed.',
    };
  }
}

function toRun(body: unknown, projectId: string): TeracRun | null {
  const object = record(body);
  const id = stringValue(object?.id);
  if (!object || !id) return null;
  const pricing = record(object.pricing);
  const stats = record(object.submission_stats);
  return {
    projectId,
    opportunityId: id,
    status: stringValue(object.status) ?? 'unknown',
    participantTarget: numberValue(object.num_participants) ?? 0,
    pricing: pricing
      ? {
          costPerParticipantCents: numberValue(pricing.cost_per_participant_cents),
          totalCostCents: numberValue(pricing.total_cost_cents),
          currency: stringValue(pricing.currency) ?? 'usd',
        }
      : null,
    submissionStats: stats
      ? {
          total: numberValue(stats.total) ?? 0,
          inProgress: numberValue(stats.in_progress) ?? 0,
          awaitingReview: numberValue(stats.awaiting_review) ?? 0,
          approved: numberValue(stats.approved) ?? 0,
          rejected: numberValue(stats.rejected) ?? 0,
        }
      : null,
    updatedAt: stringValue(object.updated_at) ?? new Date().toISOString(),
  };
}

async function resolveProjectId(): Promise<
  { ok: true; projectId: string } | { ok: false; error: string; status: number }
> {
  const configured = process.env.TERAC_PROJECT_ID;
  if (configured) return { ok: true, projectId: configured };

  const listed = await teracRequest('/projects?limit=100');
  if (!listed.ok) {
    return { ok: false, error: listed.error ?? 'Could not list Terac projects.', status: listed.status };
  }
  const projects = record(listed.body)?.data;
  if (Array.isArray(projects)) {
    const existing = projects.find((project) => record(project)?.name === PROJECT_NAME);
    const existingId = stringValue(record(existing)?.id);
    if (existingId) return { ok: true, projectId: existingId };
  }

  const created = await teracRequest('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: PROJECT_NAME }),
  });
  const projectId = stringValue(record(created.body)?.id);
  if (!created.ok || !projectId) {
    return {
      ok: false,
      error: created.error ?? 'Terac did not return a project id.',
      status: created.status,
    };
  }
  return { ok: true, projectId };
}

export interface TeracActionResult {
  ok: boolean;
  run: TeracRun | null;
  error?: string;
  status?: number;
}

export async function createTeracDraft(input: {
  campaign: CampaignDraft;
  appUrl: string;
  participants?: number;
}): Promise<TeracActionResult> {
  const project = await resolveProjectId();
  if (!project.ok) return { ok: false, run: null, error: project.error, status: project.status };
  const participants = Math.max(1, Math.min(999, Math.round(input.participants ?? 12)));
  const taskUrl = `${input.appUrl.replace(/\/+$/, '')}/research/campaign?campaignId=${encodeURIComponent(input.campaign.id)}`;
  const created = await teracRequest('/opportunities', {
    method: 'POST',
    body: JSON.stringify({
      title: `Which campaign message is clearer?`,
      internal_title: `GrowXth A/B · ${input.campaign.title}`.slice(0, 200),
      description:
        'A short blind comparison of two campaign messages. Choose the clearer message and explain why.',
      project_id: project.projectId,
      num_participants: participants,
      business_type: 'b2c',
      expected_days_to_complete: 5,
      tasks: [
        {
          sequence: 1,
          task_type: 'interview',
          review_type: 'auto_approve',
          task_url: taskUrl,
          title: 'Blind message comparison',
          description: 'Choose the message that most clearly explains the value.',
          duration_minutes: 2,
        },
      ],
    }),
  });
  const run = toRun(created.body, project.projectId);
  return {
    ok: created.ok && run != null,
    run,
    error: created.ok && run ? undefined : created.error ?? 'Terac did not return an opportunity.',
    status: created.status,
  };
}

export async function getTeracOpportunity(run: TeracRun): Promise<TeracActionResult> {
  const result = await teracRequest(`/opportunities/${encodeURIComponent(run.opportunityId)}`);
  const next = toRun(result.body, run.projectId);
  return {
    ok: result.ok && next != null,
    run: next,
    error: result.ok && next ? undefined : result.error ?? 'Terac opportunity not found.',
    status: result.status,
  };
}

export async function launchTeracOpportunity(run: TeracRun): Promise<TeracActionResult> {
  const result = await teracRequest(
    `/opportunities/${encodeURIComponent(run.opportunityId)}/launch`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  const next = toRun(result.body, run.projectId);
  return {
    ok: result.ok && next != null,
    run: next,
    error: result.ok && next ? undefined : result.error ?? 'Terac launch failed.',
    status: result.status,
  };
}

export const terac = {
  createDraft: createTeracDraft,
  getOpportunity: getTeracOpportunity,
  launchOpportunity: launchTeracOpportunity,
};
