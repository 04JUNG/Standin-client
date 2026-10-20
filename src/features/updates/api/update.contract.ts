export type UpdateAvailability =
  | { kind: "disabled" }
  | { kind: "up-to-date" }
  | { kind: "available"; version: string; notes?: string | null };

export type DownloadProgress = { ratio: number | null };
export type CachedUpdate = {
  version: string;
  notes?: string | null;
  /** An installer was already launched. Retry only on explicit user action. */
  attempted: boolean;
};

export interface UpdateService {
  currentVersion(): Promise<string>;
  isConfigured(): Promise<boolean>;
  cached(): Promise<CachedUpdate | null>;
  check(): Promise<UpdateAvailability>;
  download(onProgress?: (progress: DownloadProgress) => void): Promise<CachedUpdate>;
  /** Installs only verified, cached bytes after reconfirming the release feed. */
  install(): Promise<void>;
  relaunch(): Promise<void>;
}
