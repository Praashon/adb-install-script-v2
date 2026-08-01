import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION).matches ?? false;
}
export function useEnterAnimation<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[] = [],
): React.RefObject<T | null> {
  const scope = useRef<T>(null);
  useLayoutEffect(() => {
    const root = scope.current;
    if (!root) return;
    const targets = root.querySelectorAll<HTMLElement>(".will-enter");
    const markEntered = (): void => root.setAttribute("data-entered", "true");
    if (targets.length === 0) {
      markEntered();
      return;
    }
    if (prefersReducedMotion()) {
      gsap.set(targets, { opacity: 1, y: 0, clearProps: "transform" });
      markEntered();
      return;
    }
    const context = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
          stagger: 0.055,
          clearProps: "transform",
        },
      );
    }, root);
    markEntered();
    return () => context.revert();
  }, deps);
  return scope;
}
export function useCountUp(
  value: number,
): React.RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion() || previous.current === value) {
      node.textContent = String(value);
      previous.current = value;
      return;
    }
    const counter = { current: previous.current };
    const tween = gsap.to(counter, {
      current: value,
      duration: 0.5,
      ease: "power2.out",
      onUpdate: () => {
        node.textContent = String(Math.round(counter.current));
      },
    });
    previous.current = value;
    return () => {
      tween.kill();
    };
  }, [value]);
  return ref;
}
