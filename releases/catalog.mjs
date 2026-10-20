// Shared by the release pipeline and the app. No network or HTML is involved.
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parts(value) {
  const match = typeof value === "string" ? value.match(versionPattern) : null;
  if (!match) throw new Error(`Invalid version: ${value}`);
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((p) => /^\d+$/.test(p) && p.length > 1 && p.startsWith("0")))
    throw new Error(`Invalid prerelease: ${value}`);
  return { core: match.slice(1, 4), prerelease };
}

function numeric(a, b) {
  return a.length !== b.length ? Math.sign(a.length - b.length) : a === b ? 0 : a < b ? -1 : 1;
}

export function compareVersions(a, b) {
  const left = parts(a),
    right = parts(b);
  for (let i = 0; i < 3; i++) {
    const order = numeric(left.core[i], right.core[i]);
    if (order) return order;
  }
  const x = left.prerelease,
    y = right.prerelease;
  if (!x.length || !y.length) return x.length === y.length ? 0 : x.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined || y[i] === undefined) return x[i] === undefined ? -1 : 1;
    if (x[i] === y[i]) continue;
    const xn = /^\d+$/.test(x[i]),
      yn = /^\d+$/.test(y[i]);
    return xn && yn ? numeric(x[i], y[i]) : xn !== yn ? (xn ? -1 : 1) : x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

export function validateCatalog(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("Release notes are missing");
  const text = (v) => typeof v === "string" && v.trim() && !/<!--|TODO|TBD|배포 전에 채워/i.test(v);
  let previous = null;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") throw new Error("Invalid release entry");
    parts(entry.version);
    if (previous && compareVersions(previous, entry.version) >= 0)
      throw new Error("Release versions must be unique and oldest first");
    previous = entry.version;
    if (
      !text(entry.title) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
      !Number.isFinite(Date.parse(entry.date)) ||
      new Date(entry.date).toISOString().slice(0, 10) !== entry.date
    )
      throw new Error(`Invalid release title/date: ${entry.version}`);
    const groups = ["features", "improvements", "fixes"];
    if (
      groups.some((key) => !Array.isArray(entry[key]) || !entry[key].every(text)) ||
      groups.every((key) => entry[key].length === 0)
    )
      throw new Error(`Release changes are missing: ${entry.version}`);
  }
  return value;
}

export function releasesBetween(catalog, previous, current) {
  try {
    if (previous && compareVersions(previous, current) >= 0) return [];
    return catalog
      .filter(
        (r) =>
          compareVersions(r.version, current) <= 0 &&
          (previous
            ? compareVersions(r.version, previous) > 0
            : compareVersions(r.version, current) === 0),
      )
      .slice()
      .reverse();
  } catch {
    return catalog.filter((r) => r.version === current);
  }
}

export function formatNotes(entry) {
  return [
    `## ${entry.version} · ${entry.title}`,
    entry.date,
    ...[
      ["features", "새 기능"],
      ["improvements", "개선"],
      ["fixes", "오류 수정"],
    ]
      .filter(([key]) => entry[key].length)
      .map(([key, title]) => `### ${title}\n${entry[key].map((line) => `- ${line}`).join("\n")}`),
  ].join("\n\n");
}
