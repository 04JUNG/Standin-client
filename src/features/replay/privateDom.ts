import { sanitizeReplay } from "./privacy";
type Data = Record<string, unknown>;
const object = (v: unknown): Data =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Defense before buffering AND before asset rewrite/queue. Never retain private DOM payloads. */
export function createReplayPrivacyFilter() {
  const privateIds = new Set<number>();
  const parents = new Map<number, number>();
  const mark = (id: number) => {
    privateIds.add(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [child, parent] of parents)
        if (privateIds.has(parent) && !privateIds.has(child)) {
          privateIds.add(child);
          changed = true;
        }
    }
  };
  const privateAttributes = (v: unknown) => {
    const a = object(v);
    return "data-replay-private" in a || /(?:^|\s)rr-block(?:\s|$)/.test(String(a.class ?? ""));
  };
  const node = (raw: unknown, parent?: number, inherited = false): unknown => {
    const n = object(raw);
    const id = typeof n.id === "number" ? n.id : undefined;
    if (id !== undefined && parent !== undefined) parents.set(id, parent);
    const hidden =
      inherited ||
      privateAttributes(n.attributes) ||
      ["canvas", "video", "audio", "iframe"].includes(String(n.tagName)) ||
      (id !== undefined && privateIds.has(id));
    if (hidden) {
      if (id !== undefined) mark(id);
      for (const child of list(n.childNodes)) node(child, id, true);
      return n.type === 3
        ? { type: 3, id, textContent: "[private]" }
        : {
            type: n.type,
            id,
            tagName: n.tagName,
            attributes: { "data-replay-private": "", class: "rr-block" },
            childNodes: [],
          };
    }
    return {
      ...n,
      ...(n.childNodes ? { childNodes: list(n.childNodes).map((child) => node(child, id)) } : {}),
    };
  };
  return (raw: unknown): unknown | undefined => {
    const e = object(raw),
      d = object(e.data);
    if (e.type === 2) {
      privateIds.clear();
      parents.clear();
      return sanitizeReplay({ ...e, data: { ...d, node: node(d.node) } });
    }
    if (e.type === 3 && d.source === 0) {
      // Process newly private nodes before text/attribute mutations in the same batch.
      for (const entry of list(d.attributes)) {
        const a = object(entry);
        if (typeof a.id === "number" && privateAttributes(a.attributes)) mark(a.id);
      }
      const adds = list(d.adds)
        .map((entry) => {
          const a = object(entry),
            p = typeof a.parentId === "number" ? a.parentId : undefined;
          return { ...a, node: node(a.node, p, p !== undefined && privateIds.has(p)) };
        })
        .filter((a) => !privateIds.has(Number(object(a).parentId)));
      return sanitizeReplay({
        ...e,
        data: {
          ...d,
          adds,
          texts: list(d.texts).filter((a) => !privateIds.has(Number(object(a).id))),
          attributes: list(d.attributes).filter((a) => !privateIds.has(Number(object(a).id))),
        },
      });
    }
    if (e.type === 3 && privateIds.has(Number(d.id))) return undefined;
    return sanitizeReplay(e);
  };
}
