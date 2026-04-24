import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface PhotoLightboxProps {
  open: boolean;
  index: number;
  total: number;
  srcFor: (index: number) => string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export function PhotoLightbox({
  open,
  index,
  total,
  srcFor,
  onIndexChange,
  onClose,
}: PhotoLightboxProps) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const resetTransform = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  useEffect(() => {
    if (open) resetTransform();
  }, [open, index, resetTransform]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && total > 1) onIndexChange((index - 1 + total) % total);
      else if (e.key === "ArrowRight" && total > 1) onIndexChange((index + 1) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total, index, onIndexChange, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0025;
      setScale(prevScale => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prevScale * (1 + delta)));
        if (next <= MIN_SCALE + 0.01) {
          setTx(0);
          setTy(0);
          return MIN_SCALE;
        }
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as EventListener);
  }, [open]);

  if (!open) return null;

  const distanceBetween = (a: React.Touch, b: React.Touch) => {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        dist: distanceBetween(e.touches[0], e.touches[1]),
        scale,
      };
      panRef.current = null;
      swipeRef.current = null;
    } else if (e.touches.length === 1) {
      const tch = e.touches[0];
      if (scale > 1) {
        panRef.current = { x: tch.clientX, y: tch.clientY, tx, ty };
        swipeRef.current = null;
      } else {
        swipeRef.current = { x: tch.clientX, y: tch.clientY, t: Date.now() };
        panRef.current = null;
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (pinchRef.current && e.touches.length === 2) {
      const newDist = distanceBetween(e.touches[0], e.touches[1]);
      const ratio = newDist / pinchRef.current.dist;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.scale * ratio));
      setScale(nextScale);
      if (nextScale <= MIN_SCALE + 0.01) {
        setTx(0);
        setTy(0);
      }
      e.preventDefault();
      return;
    }
    if (panRef.current && e.touches.length === 1 && scale > 1) {
      const tch = e.touches[0];
      setTx(panRef.current.tx + (tch.clientX - panRef.current.x));
      setTy(panRef.current.ty + (tch.clientY - panRef.current.y));
      e.preventDefault();
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (pinchRef.current && e.touches.length < 2) {
      pinchRef.current = null;
      if (scale <= MIN_SCALE + 0.05) {
        setScale(1);
        setTx(0);
        setTy(0);
      }
    }
    if (panRef.current && e.touches.length === 0) {
      panRef.current = null;
    }
    if (swipeRef.current && e.changedTouches.length > 0) {
      const tch = e.changedTouches[0];
      const dx = tch.clientX - swipeRef.current.x;
      const dy = tch.clientY - swipeRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (scale <= 1) {
        if (absDx > 50 && absDx > absDy && total > 1) {
          onIndexChange((index + (dx < 0 ? 1 : -1) + total) % total);
        } else if (dy > 100 && absDy > absDx) {
          onClose();
        }
      }
      swipeRef.current = null;
    }
  };

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      resetTransform();
    } else {
      setScale(2);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center touch-none select-none"
      onClick={onBackdropClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      data-testid="lightbox-overlay"
    >
      <button
        type="button"
        className="absolute top-3 right-3 z-10 bg-black/60 text-white rounded-full p-2"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label={t("close")}
        data-testid="button-lightbox-close"
      >
        <X className="w-6 h-6" />
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white rounded-full p-2"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + total) % total); }}
            aria-label={t("previousPhoto")}
            data-testid="button-lightbox-prev"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white rounded-full p-2"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % total); }}
            aria-label={t("nextPhoto")}
            data-testid="button-lightbox-next"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white text-sm px-3 py-1 rounded-full"
            data-testid="text-lightbox-counter"
          >
            {index + 1} / {total}
          </div>
        </>
      )}

      <img
        src={srcFor(index)}
        alt=""
        draggable={false}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: pinchRef.current || panRef.current ? "none" : "transform 0.15s ease-out",
        }}
        className="max-w-full max-h-full object-contain will-change-transform"
        data-testid="img-lightbox"
      />
    </div>
  );
}
