import type { ReactNode } from "react";
import "./compactPoseLayout.css";
import { CompactPoseContext } from "./compactPoseContext";

/** Only the floating candidate surface opts in. Desktop cards keep their own sizing. */

export function CompactPoseLayout({ children }: { children: ReactNode }) {
  return (
    <CompactPoseContext.Provider value={true}>
      <div className="compact-pose-layout">
        <p className="compact-pose-reference-note">
          기본 체형의 정면 모습이에요. 저장할 모습과 다를 수 있어요.
        </p>
        {children}
      </div>
    </CompactPoseContext.Provider>
  );
}

/** Image interaction belongs to the candidate selection control. */
export function CompactPoseImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="compact-pose-image">
      <img src={src} alt={alt} />
    </div>
  );
}
