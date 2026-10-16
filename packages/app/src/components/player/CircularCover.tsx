import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

/** 保留底图，新封面加载成功后从中心圆形扩散覆盖；连续切换以最新目标为准。 */
export default function CircularCover({ src, className, alt = "封面" }: {
  src?: string;
  className: string;
  alt?: string;
}) {
  const [base, setBase] = useState(src);
  const [loaded, setLoaded] = useState<string>();
  const reducedMotion = useReducedMotion();
  const changing = src !== base;
  const ready = !src || loaded === src;
  const image = (url: string | undefined, hidden: boolean) => url ? (
    <img src={url} alt={hidden ? "" : alt} aria-hidden={hidden || undefined}
      className="h-full w-full object-cover" />
  ) : <div className="h-full w-full" style={{ background: "rgba(255, 255, 255, 0.08)" }} />;

  return (
    <div className={`relative overflow-hidden ${className}`} data-testid="circular-cover">
      {image(base, changing)}
      {changing && (
        <motion.div
          key={src ?? "empty"}
          className="absolute inset-0"
          data-testid="cover-reveal"
          initial={{ clipPath: "circle(0% at 50% 50%)" }}
          animate={{ clipPath: ready ? "circle(72% at 50% 50%)" : "circle(0% at 50% 50%)" }}
          transition={{ duration: reducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => { if (ready) setBase(src); }}
        >
          {src ? (
            <img src={src} alt={alt} className="h-full w-full object-cover"
              onLoad={() => setLoaded(src)} />
          ) : image(undefined, false)}
        </motion.div>
      )}
    </div>
  );
}
