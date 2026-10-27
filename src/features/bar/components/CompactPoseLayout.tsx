import type { ReactNode } from "react";
import "./compactPoseLayout.css";
import { CompactPoseContext } from "./compactPoseContext";

/** Only the floating candidate surface opts in. Desktop cards keep their own sizing. */

export function CompactPoseLayout({ children }: { children: ReactNode }) {
  return (
    <CompactPoseContext.Provider value={true}>
      <div className="compact-pose-layout">{children}</div>
    </CompactPoseContext.Provider>
  );
}

/** Image interaction belongs to the candidate selection control. */
export function CompactPoseImage({
  src,
  alt,
  onError,
  onLoad,
}: {
  src: string;
  alt: string;
  onError?: () => void;
  onLoad?: () => void;
}) {
  return (
    <div className="compact-pose-image">
      <img src={src} onLoad={onLoad} onError={onError} alt={alt} />
    </div>
  );
}
