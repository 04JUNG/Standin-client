import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import type { AnalyticsService } from "./analytics.contract";

export const analyticsHttp: AnalyticsService = {
  async sendEvents({ events }): Promise<void> {
    await apiFetch(endpoints.events.batch, { method: "POST", auth: false, body: { events } });
  },

  async confirmSelections({ jobId, selections }): Promise<void> {
    await apiFetch(endpoints.analysis.selections(jobId), {
      method: "PUT",
      auth: false,
      body: { selections },
    });
  },

  async submitFeedback({ jobId, reason }): Promise<void> {
    await apiFetch(endpoints.analysis.feedback(jobId), {
      method: "POST",
      auth: false,
      body: { reason },
    });
  },
};
