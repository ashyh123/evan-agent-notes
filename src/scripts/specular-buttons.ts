import { onPageChange } from "./page-lifecycle";

onPageChange((signal) => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(any-pointer: fine)");
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;
  const controls = () =>
    document.querySelectorAll<HTMLElement>(".specular-button");

  const reset = () => {
    pointer = null;
    controls().forEach((control) => {
      ["--sb-near", "--sb-angle", "--sb-x", "--sb-y"].forEach((property) =>
        control.style.removeProperty(property),
      );
    });
  };
  const update = () => {
    frame = 0;
    if (!pointer || reducedMotion.matches || !finePointer.matches) return;
    const { x, y } = pointer;
    const measured = Array.from(controls(), (control) => ({
      control,
      rect: control.getBoundingClientRect(),
    }));
    measured.forEach(({ control, rect }) => {
      if (
        !rect.width ||
        !rect.height ||
        control.matches(":disabled, [aria-disabled='true']")
      ) {
        control.style.setProperty("--sb-near", "0");
        return;
      }
      const distance = Math.hypot(
        Math.max(rect.left - x, 0, x - rect.right),
        Math.max(rect.top - y, 0, y - rect.bottom),
      );
      const near = Math.max(0, 1 - distance / 250);
      control.style.setProperty(
        "--sb-near",
        String(near * near * (3 - 2 * near)),
      );
      if (!near) return;
      const angle = Math.atan2(
        y - rect.top - rect.height / 2,
        x - rect.left - rect.width / 2,
      );
      control.style.setProperty(
        "--sb-angle",
        `${(angle * 180) / Math.PI + 80}deg`,
      );
      control.style.setProperty("--sb-x", `${x - rect.left}px`);
      control.style.setProperty("--sb-y", `${y - rect.top}px`);
    });
  };
  const schedule = () => {
    if (!frame && pointer) frame = requestAnimationFrame(update);
  };
  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    },
    { passive: true, signal },
  );
  document.documentElement.addEventListener("pointerleave", reset, { signal });
  window.addEventListener("blur", reset, { signal });
  window.addEventListener("scroll", schedule, {
    passive: true,
    capture: true,
    signal,
  });
  window.addEventListener("resize", schedule, { signal });
  reducedMotion.addEventListener("change", reset, { signal });
  finePointer.addEventListener("change", reset, { signal });
  signal.addEventListener("abort", () => cancelAnimationFrame(frame), {
    once: true,
  });
});
