import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const BvhPreview = lazy(async () => {
  const module = await import("./BvhPreview");
  return { default: module.BvhPreview };
});

type LazyBvhPreviewProps = {
  url: string;
  label: string;
};

/** Three.js와 BVHLoader를 확인 화면에 들어왔을 때만 내려받는다. */
export function LazyBvhPreview(props: LazyBvhPreviewProps) {
  return (
    <Suspense
      fallback={
        <div className="flex aspect-[4/3] w-full items-center justify-center gap-2 rounded-lg bg-brand-paper text-[12px] text-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span>3D 미리보기를 준비하는 중…</span>
        </div>
      }
    >
      <BvhPreview {...props} />
    </Suspense>
  );
}
