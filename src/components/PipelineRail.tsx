import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { prefersReducedMotion } from "@/hooks/useEnterAnimation";
import { STEP_LABELS, STEP_TICKS, stepsForJobType, type Job } from "@/types";
import { cn } from "@/lib/utils";
type SegmentState = "done" | "active" | "pending" | "failed";
interface PipelineRailProps {
  type: Job["type"];
  currentStep: string | null;
  progress: number;
  status: Job["status"];
  compact?: boolean;
}
export function PipelineRail({
  type,
  currentStep,
  progress,
  status,
  compact = false,
}: PipelineRailProps) {
  const steps = stepsForJobType(type);
  const activeIndex = Math.max(0, steps.indexOf(currentStep ?? ""));
  const railRef = useRef<HTMLDivElement>(null);
  const isFailed = status === "failed";
  const isDone = status === "completed";
  const isRunning = status === "running";
  const segmentSpan = 100 / steps.length;
  const withinSegment = isDone
    ? 1
    : Math.min(
        1,
        Math.max(0, (progress - activeIndex * segmentSpan) / segmentSpan),
      );
  const stateFor = (index: number): SegmentState => {
    if (isDone) return "done";
    if (index < activeIndex) return "done";
    if (index > activeIndex) return "pending";
    return isFailed ? "failed" : "active";
  };
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const fill = rail.querySelector<HTMLElement>("[data-active-fill]");
    if (!fill) return;
    const target = `${withinSegment * 100}%`;
    if (prefersReducedMotion()) {
      gsap.set(fill, { width: target });
      return;
    }
    const tween = gsap.to(fill, {
      width: target,
      duration: 0.5,
      ease: "power2.out",
      overwrite: "auto",
    });
    return () => {
      tween.kill();
    };
  }, [withinSegment, activeIndex]);
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || !isRunning || prefersReducedMotion()) return;
    const active = rail.querySelector<HTMLElement>("[data-active-seg]");
    if (!active) return;
    const tween = gsap.fromTo(
      active,
      { opacity: 0.55 },
      { opacity: 1, duration: 0.9, repeat: -1, yoyo: true, ease: "sine.inOut" },
    );
    return () => {
      tween.kill();
      gsap.set(active, { opacity: 1 });
    };
  }, [isRunning, activeIndex]);
  return (
    <div ref={railRef}>
      <div
        className="rail"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {steps.map((step, index) => {
          const state = stateFor(index);
          const active = state === "active";
          return (
            <div
              key={step}
              className="rail-seg"
              data-state={state}
              data-active-seg={active && isRunning ? "" : undefined}
              title={STEP_LABELS[step] ?? step}
            >
              <div
                className="rail-seg-fill"
                data-active-fill={active ? "" : undefined}
                style={
                  active
                    ? undefined
                    : { width: state === "pending" ? "0%" : "100%" }
                }
              />
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="flex items-baseline justify-between gap-4 mt-2.5">
          <div className="flex flex-wrap gap-x-3 gap-y-1 min-w-0">
            {steps.map((step, index) => {
              const state = stateFor(index);
              return (
                <span
                  key={step}
                  className={cn(
                    "font-mono text-eyebrow uppercase transition-colors duration-200",
                    state === "active" && !isFailed && "text-signal",
                    state === "failed" && "text-fault",
                    state === "done" && "text-ink-3",
                    state === "pending" && "text-ink-3/45",
                  )}
                >
                  {STEP_TICKS[step] ?? step}
                </span>
              );
            })}
          </div>
          <span className="font-mono text-eyebrow text-ink-3 shrink-0 tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
      )}
    </div>
  );
}
