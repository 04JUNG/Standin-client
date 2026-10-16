import { catalogSchema, selectionSchema } from "./contract";
export const catalog = catalogSchema.parse({
  schema_version: 1,
  library_version: "hand-library-v1",
  library_sha256: "a".repeat(64),
  default_preset: "relaxed",
  fallback_order: ["relaxed", "fist", "open"],
  thumbnails_available: false,
  categories: [
    {
      id: "basic",
      label: "기본",
      presets: [
        { id: "relaxed", label: "힘 뺀 손", description: "자연스러운 손", thumbnails: null },
        { id: "fist", label: "주먹", description: "손가락을 굽힌 손", thumbnails: null },
        { id: "open", label: "편 손", description: "컵을 받치는 손", thumbnails: null },
      ],
    },
  ],
});
export const selection = selectionSchema.parse({
  personIndex: 0,
  left: "relaxed",
  right: "open",
  recommended: { left: "relaxed", right: "open" },
  revision: 0,
  library_version: catalog.library_version,
  library_sha256: catalog.library_sha256,
  changed: [],
  observation: {
    library_version: catalog.library_version,
    status: "vlm",
    left: {
      preset: "relaxed",
      source: "default",
      confidence: null,
      visible: false,
      candidates: ["fist", "relaxed"],
    },
    right: {
      preset: "open",
      source: "vlm",
      confidence: "low",
      visible: true,
      candidates: ["open", "fist"],
    },
  },
});
