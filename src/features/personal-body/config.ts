/** Enabled only by a build that explicitly includes the reviewed native runtime. */
export const personalDeformeEnabled = () => import.meta.env.VITE_PERSONAL_BODY_ENABLED === "true";
