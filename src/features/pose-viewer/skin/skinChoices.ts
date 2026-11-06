import { z } from "zod";

export const skinIdSchema = z.enum(["default", "gray-guide", "flesh", "flesh-guide", "muscle"]);
export type SkinId = z.infer<typeof skinIdSchema>;
/** SHA256 of compact, sorted-key {id,version}; fixed protocol choices, not file hashes. */
export const SKIN_CHOICE_SHA = {
  "gray-guide": "4d807623802095e4b66d84eff6ef7fed2b28d8fd0a33496e0b7d60536d865541",
  flesh: "3d57b780abf2c943d8f65a6740f1bc0bdc4a4c47bc5b0275eb4c283c976f5aca",
  "flesh-guide": "be85b4151371093da7c1a784a12b6ad167e370626b8fdb1045a8086294a2a0b8",
  muscle: "b86c009cd3124b9fd7e2109f93f1132e5c1f42729b109f41c32f83874fe5e9e3",
} as const;
export const SKIN_CHOICES: ReadonlyArray<{ id: SkinId; label: string }> = [
  { id: "default", label: "기본" },
  { id: "gray-guide", label: "회색 가이드" },
  { id: "flesh", label: "살색" },
  { id: "flesh-guide", label: "살색 가이드" },
  { id: "muscle", label: "근육선" },
];
