import { onPageChange } from "./page-lifecycle";

// Adapt RefineFrame's progressive mosaic reveal to a short Astro entry animation.
let played = false;
onPageChange((signal) => {
  const entry = document.querySelector<HTMLElement>("[data-entry-loader]");
  if (!entry) return;
  if (played || entry.hidden) {
    entry.remove();
    return;
  }
  played = true;
  let frame = 0;
  let done = false;
  const finish = () => {
    done = true;
    cancelAnimationFrame(frame);
    entry.remove();
  };
  const interaction = new AbortController();
  signal.addEventListener("abort", finish, { once: true });
  const dismiss = () => {
    finish();
    interaction.abort();
  };
  entry.querySelector("button")?.addEventListener("click", dismiss, {
    signal: interaction.signal,
  });
  window.addEventListener("pointerdown", dismiss, {
    capture: true,
    signal: interaction.signal,
  });
  window.addEventListener("keydown", dismiss, {
    capture: true,
    signal: interaction.signal,
  });
  window.addEventListener("wheel", dismiss, {
    passive: true,
    signal: interaction.signal,
  });
  window.addEventListener("touchmove", dismiss, {
    passive: true,
    signal: interaction.signal,
  });
  signal.addEventListener("abort", () => interaction.abort(), { once: true });
  const deadline = window.setTimeout(dismiss, 1080);
  signal.addEventListener("abort", () => clearTimeout(deadline), {
    once: true,
  });

  const image = entry.querySelector("img");
  const canvas = entry.querySelector("canvas");
  const context = canvas?.getContext("2d");
  const media = entry.querySelector<HTMLElement>("[data-refine-frame]");
  if (!image || !canvas || !context || !media) return;
  const start = () => {
    if (done || !image.naturalWidth) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    canvas.width = width;
    canvas.height = height;
    const levels = [32, 16, 8, 4, 1].map((block) => {
      const layer = document.createElement("canvas");
      layer.width = width;
      layer.height = height;
      const output = layer.getContext("2d");
      const small = document.createElement("canvas");
      small.width =
        block === 1 ? width : Math.max(1, Math.round(width / (block * ratio)));
      small.height =
        block === 1
          ? height
          : Math.max(1, Math.round(height / (block * ratio)));
      const sample = small.getContext("2d");
      if (sample && output) {
        sample.drawImage(image, 0, 0, small.width, small.height);
        output.imageSmoothingEnabled = block === 1;
        output.drawImage(small, 0, 0, width, height);
      }
      return layer;
    });
    media.dataset.mosaic = "";
    media.dataset.status = "refining";
    const ink = getComputedStyle(media).color;
    const began = performance.now();
    const draw = (now: number) => {
      if (done) return;
      const position =
        Math.max(0, Math.min(1, (now - began) / 720)) * (levels.length - 1);
      const index = Math.floor(position);
      const fraction = position - index;
      context.clearRect(0, 0, width, height);
      context.drawImage(levels[index], 0, 0);
      if (index < levels.length - 1) {
        const edge = 24 * ratio;
        const front = fraction * (height + edge) - edge / 2;
        const top = Math.max(0, Math.floor(front - edge / 2));
        if (top > 0)
          context.drawImage(
            levels[index + 1],
            0,
            0,
            width,
            top,
            0,
            0,
            width,
            top,
          );
        for (let strip = 0; strip < 8; strip++) {
          const y = front - edge / 2 + (strip * edge) / 8;
          const y0 = Math.max(0, y);
          const h = Math.min(height, y + edge / 8) - y0;
          if (h <= 0) continue;
          const t = 1 - (strip + 0.5) / 8;
          context.globalAlpha = t * t * (3 - 2 * t);
          context.drawImage(
            levels[index + 1],
            0,
            y0,
            width,
            h,
            0,
            y0,
            width,
            h,
          );
        }
        context.globalAlpha = 0.18;
        context.fillStyle = ink;
        context.fillRect(0, front - ratio, width, 2 * ratio);
        context.globalAlpha = 1;
      }
      if (position < levels.length - 1) frame = requestAnimationFrame(draw);
      else {
        media.dataset.status = "complete";
        const label = entry.querySelector("[data-entry-label]");
        if (label) label.textContent = "欢迎，开始阅读";
      }
    };
    draw(began);
    frame = requestAnimationFrame(draw);
  };
  if (image.complete) start();
  else {
    image.addEventListener("load", start, { once: true, signal });
    image.addEventListener("error", dismiss, { once: true, signal });
  }
});
