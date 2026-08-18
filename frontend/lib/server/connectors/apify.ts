const APIFY_BASE = 'https://api.apify.com/v2';

type ActorTerminalStatus = 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT';

interface ActorRunData {
  id: string;
  status: string;
  statusMessage?: string | null;
  defaultDatasetId?: string | null;
}

export interface ApifyActorResult {
  actorId: string;
  runId: string | null;
  status: ActorTerminalStatus | 'UNAVAILABLE';
  items: unknown[];
  warning: string | null;
}

export interface RunActorOptions {
  waitSeconds?: number;
  timeoutSeconds?: number;
  memoryMb?: number;
  maxItems?: number;
  maxTotalChargeUsd?: number;
}

function actorPath(actorId: string): string {
  return actorId.replace('/', '~');
}

function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

async function readData(response: Response): Promise<ActorRunData> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
        ? payload.error.message
        : `Apify request failed (${response.status}).`;
    throw new Error(message);
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('data' in payload) ||
    typeof payload.data !== 'object' ||
    payload.data === null
  ) {
    throw new Error('Apify returned an invalid run payload.');
  }
  return payload.data as ActorRunData;
}

async function abortRun(runId: string, token: string): Promise<void> {
  await fetch(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}/abort`, {
    method: 'POST',
    headers: authHeaders(token),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
}

async function readDatasetItems(runId: string, token: string): Promise<unknown[]> {
  const datasetResponse = await fetch(
    `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}/dataset/items?clean=true`,
    {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!datasetResponse.ok) {
    throw new Error(`Could not read Apify dataset (${datasetResponse.status}).`);
  }
  const items: unknown = await datasetResponse.json();
  return Array.isArray(items) ? items : [];
}

export async function runApifyActor(
  actorId: string,
  input: unknown,
  options: RunActorOptions = {},
): Promise<ApifyActorResult> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return {
      actorId,
      runId: null,
      status: 'UNAVAILABLE',
      items: [],
      warning: 'APIFY_TOKEN is not configured.',
    };
  }

  const waitSeconds = Math.max(1, Math.min(60, options.waitSeconds ?? 24));
  const query = new URLSearchParams({
    timeout: String(options.timeoutSeconds ?? 60),
    memory: String(options.memoryMb ?? 256),
  });
  if (options.maxItems != null) query.set('maxItems', String(options.maxItems));
  if (options.maxTotalChargeUsd != null) {
    query.set('maxTotalChargeUsd', String(options.maxTotalChargeUsd));
  }

  let run: ActorRunData;
  try {
    const started = await fetch(
      `${APIFY_BASE}/actors/${actorPath(actorId)}/runs?${query.toString()}`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(8000),
      },
    );
    run = await readData(started);
  } catch (error) {
    return {
      actorId,
      runId: null,
      status: 'UNAVAILABLE',
      items: [],
      warning: error instanceof Error ? error.message : 'Could not start the Apify Actor.',
    };
  }

  try {
    const waited = await fetch(
      `${APIFY_BASE}/actor-runs/${encodeURIComponent(run.id)}?waitForFinish=${waitSeconds}`,
      {
        headers: authHeaders(token),
        signal: AbortSignal.timeout((waitSeconds + 4) * 1000),
      },
    );
    run = await readData(waited);
  } catch (error) {
    await abortRun(run.id, token);
    const items = await readDatasetItems(run.id, token).catch(() => []);
    return {
      actorId,
      runId: run.id,
      status: 'TIMED-OUT',
      items,
      warning: error instanceof Error ? error.message : 'Apify Actor timed out.',
    };
  }

  if (run.status !== 'SUCCEEDED') {
    const terminal = ['FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status);
    if (!terminal) {
      await abortRun(run.id, token);
    }
    const items = await readDatasetItems(run.id, token).catch(() => []);
    return {
      actorId,
      runId: run.id,
      status: terminal
        ? (run.status as ActorTerminalStatus)
        : 'TIMED-OUT',
      items,
      warning:
        run.statusMessage ??
        (terminal
          ? `Apify Actor finished with ${run.status}.`
          : `Apify Actor did not finish within ${waitSeconds} seconds and was aborted.`),
    };
  }

  try {
    const items = await readDatasetItems(run.id, token);
    return {
      actorId,
      runId: run.id,
      status: 'SUCCEEDED',
      items,
      warning: null,
    };
  } catch (error) {
    return {
      actorId,
      runId: run.id,
      status: 'UNAVAILABLE',
      items: [],
      warning: error instanceof Error ? error.message : 'Could not read the Apify dataset.',
    };
  }
}
