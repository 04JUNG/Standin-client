import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { JobStatusTone } from "../lib/jobStatusLabel";

const TONE_CLASS: Record<JobStatusTone, string> = {
  done: "bg-brand-sky/20 text-text-primary",
  failed: "bg-brand-coral/15 text-brand-coral",
  running: "bg-surface-2 text-text-secondary",
};

type JobStatusBadgeProps = {
  label: string;
  tone: JobStatusTone;
};

export function JobStatusBadge({ label, tone }: JobStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
        TONE_CLASS[tone],
      )}
    >
      {tone === "running" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {label}
    </span>
  );
}
