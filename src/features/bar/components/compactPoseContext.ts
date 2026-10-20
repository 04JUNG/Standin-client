import { createContext, useContext } from "react";

export const CompactPoseContext = createContext(false);
export const useCompactPoseLayout = () => useContext(CompactPoseContext);
