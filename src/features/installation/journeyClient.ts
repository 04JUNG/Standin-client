import { apiFetch, ApiError } from "@/shared/api/client";
import { safeStorage } from "@/shared/lib/safeStorage";
import { env } from "@/shared/lib/env";

export const JOURNEY_VERSION = "2026-11-09";
const endpoint = "/v1/installations/current/journey";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const names = new Set([
  "app_started",
  "input_confirmed",
  "results_viewed",
  "candidate_selected",
  "selection_confirmed",
  "analysis_failed",
  "export_completed",
  "export_failed",
  "capture_failed",
]);
type Link = { id: string; consentedAt: string; expiresAt: string };
type Event = { id: string; name: string; at: string };
type Queued = Event & { receipt: string };
const QUEUE = "standin.journey.queue.v1",
  REVOKE = "standin.journey.revoke.v1";

export function parseJourneyUrl(value: string, environment = env.appEnv): string | null {
  try {
    const url = new URL(value);
    const protocol =
      environment === "production"
        ? "standin:"
        : environment === "staging"
          ? "standin-staging:"
          : "standin-dev:";
    const token = url.searchParams.get("token");
    return url.protocol === protocol &&
      url.host === "journey" &&
      ["", "/"].includes(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      [...url.searchParams].length === 1 &&
      token &&
      /^[A-Za-z0-9_-]{43}$/.test(token)
      ? token
      : null;
  } catch {
    return null;
  }
}

export function createJourneyClient(request = apiFetch, storage = safeStorage, now = Date.now) {
  let installation = "",
    link: Link | null = null,
    generation = 0,
    retryAt = 0;
  let flushing = false,
    mutation: Promise<unknown> = Promise.resolve(),
    mutating = 0,
    started = "";
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  function read(): Queued[] {
    try {
      const events = JSON.parse(storage.getItem(QUEUE) ?? "[]") as unknown;
      const kept = Array.isArray(events)
        ? events
            .filter(
              (e) =>
                e &&
                e.receipt === link?.id &&
                UUID.test(e.id) &&
                names.has(e.name) &&
                Date.parse(e.at) >= now() - 86400000 &&
                Date.parse(e.at) >= Date.parse(link!.consentedAt),
            )
            .slice(-120)
        : [];
      write(kept);
      return kept;
    } catch {
      return [];
    }
  }
  function write(events: Queued[]) {
    storage.setItem(QUEUE, JSON.stringify(events.slice(-120)));
  }
  function stop() {
    generation++;
    link = null;
    storage.removeItem(QUEUE);
    notify();
  }
  function pendingRevoke() {
    return Boolean(installation && storage.getItem(REVOKE) === installation);
  }
  function accept(value: unknown) {
    const v = value as Link | null;
    link =
      v &&
      UUID.test(v.id) &&
      Number.isFinite(Date.parse(v.consentedAt)) &&
      Date.parse(v.expiresAt) > now()
        ? v
        : null;
    if (!link) storage.removeItem(QUEUE);
    notify();
  }
  async function flush() {
    if (!link || pendingRevoke() || flushing || now() < retryAt || mutating) return;
    if (Date.parse(link.expiresAt) <= now()) {
      stop();
      return;
    }
    const current = generation,
      receipt = link.id,
      batch = read().slice(0, 30);
    if (!batch.length) return;
    flushing = true;
    try {
      await request(endpoint + "/events", {
        method: "POST",
        auth: false,
        body: { receipt, events: batch.map(({ id, name, at }) => ({ id, name, at })) },
      });
      if (generation === current) {
        const ids = new Set(batch.map((e) => e.id));
        write(read().filter((e) => !ids.has(e.id)));
      }
    } catch (error) {
      if (generation !== current) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) stop();
      else if (error instanceof ApiError && [400, 413].includes(error.status)) {
        const ids = new Set(batch.map((e) => e.id));
        write(read().filter((e) => !ids.has(e.id)));
      } else retryAt = now() + 60_000;
    } finally {
      flushing = false;
    }
  }
  function track(name: string) {
    if (!link || pendingRevoke() || !names.has(name)) return;
    if (Date.parse(link.expiresAt) <= now()) {
      stop();
      return;
    }
    write([
      ...read(),
      {
        receipt: link.id,
        id: crypto.randomUUID(),
        name,
        at: new Date(Math.max(now(), Date.parse(link.consentedAt))).toISOString(),
      },
    ]);
    void flush();
  }
  function revoke() {
    stop();
    storage.setItem(REVOKE, installation);
    mutating++;
    const owner = installation;
    mutation = mutation
      .catch(() => undefined)
      .then(async () => {
        if (!owner || owner !== installation) return;
        await request(endpoint, { method: "DELETE", auth: false });
        if (owner === installation) storage.removeItem(REVOKE);
      })
      .finally(() => {
        mutating--;
        notify();
      });
    return mutation;
  }
  return {
    track,
    flush,
    revoke,
    pendingRevoke,
    link: () => link,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    setInstallation(id: string | null) {
      if (installation !== (id ?? "")) {
        generation++;
        link = null;
        installation = id ?? "";
        started = "";
        retryAt = 0;
        notify();
      }
    },
    reset() {
      stop();
      installation = "";
      started = "";
      storage.removeItem(REVOKE);
    },
    async refresh() {
      if (!installation || mutating) return;
      if (pendingRevoke()) {
        await revoke();
        return;
      }
      const current = generation;
      try {
        const result = await request<{ link: Link | null }>(endpoint, {
          auth: false,
          cache: "no-store",
        });
        if (current !== generation || pendingRevoke()) return;
        accept(result.link);
        if (link && started !== installation) {
          started = installation;
          track("app_started");
        }
        void flush();
      } catch {
        /* No grant is inferred from a failed read. Previously loaded receipt has a server expiry. */
      }
    },
    async claim(token: string) {
      if (!installation || !/^[A-Za-z0-9_-]{43}$/.test(token) || pendingRevoke())
        throw Error("unavailable");
      const current = ++generation,
        owner = installation;
      mutating++;
      mutation = mutation
        .catch(() => undefined)
        .then(async () => {
          if (current !== generation || owner !== installation) return;
          const result = await request<{ link: Link | null }>(endpoint, {
            method: "POST",
            auth: false,
            body: { token, consent: true, version: JOURNEY_VERSION },
          });
          if (current !== generation || pendingRevoke()) return;
          accept(result.link);
          if (!link) throw Error("link_unavailable");
          // This is an observed current app session, not a new installation/first-run claim.
          if (link) {
            started = installation;
            track("app_started");
          }
        })
        .finally(() => {
          mutating--;
          void flush();
        });
      await mutation;
    },
  };
}
// Resolve the shared HTTP client only on an authorized request, not while importing a UI module.
export const journeyClient = createJourneyClient((path, options) =>
  apiFetch(path, { ...options, signal: AbortSignal.timeout(10_000) }),
);
