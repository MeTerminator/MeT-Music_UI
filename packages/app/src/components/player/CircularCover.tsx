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
  const layers = changing ? [base, src] : [base];

  return (
    <div className={`relative overflow-hidden ${className}`} data-testid="circular-cover">
      {layers.map((url, index) => {
        const revealing = changing && index === 1;
        const hidden = changing && !revealing;
        return (
          <motion.div
            key={url ?? "empty"}
            className={revealing ? "absolute inset-0" : "relative h-full w-full"}
            data-testid={revealing ? "cover-reveal" : undefined}
            initial={revealing ? { clipPath: "circle(0% at 50% 50%)" } : false}
            animate={{ clipPath: !revealing || ready ? "circle(72% at 50% 50%)" : "circle(0% at 50% 50%)" }}
            transition={{ duration: reducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
            // 用相同 key 将已显示的新图提升为底图，避免卸载后换 src 造成空白帧。
            onAnimationComplete={() => { if (revealing && ready) setBase(url); }}
          >
            {url ? (
              <img src={url} alt={hidden ? "" : alt} aria-hidden={hidden || undefined}
                className="h-full w-full object-cover"
                onLoad={revealing ? () => setLoaded(url) : undefined} />
            ) : <div className="h-full w-full" style={{ background: "rgba(255, 255, 255, 0.08)" }} />}
          </motion.div>
        );
      })}
    </div>
  );
}
