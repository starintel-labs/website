export function initFeatureSlider(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>(".si-feature-track")!;
  const slides = [...track.querySelectorAll<HTMLElement>(".si-feature-slide")];
  const controls = root.querySelector<HTMLElement>(".si-slider-controls")!;
  const pause = controls.querySelector<HTMLButtonElement>("[data-pause]")!;
  const count = controls.querySelector<HTMLElement>(".si-slider-count")!;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0;
  let paused = motion.matches;
  let hovering = false;
  let focused = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function show(next: number): void {
    index = (next + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide, i) => {
      slide.inert = i !== index;
      slide.setAttribute("aria-hidden", String(i !== index));
    });
    count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
  }
  function schedule(): void {
    clearInterval(timer);
    pause.textContent = paused ? "Play" : "Pause";
    pause.setAttribute(
      "aria-label",
      paused ? "Play slideshow" : "Pause slideshow",
    );
    if (!paused && !hovering && !focused && !document.hidden)
      timer = setInterval(() => show(index + 1), 6000);
  }
  controls.hidden = false;
  root.classList.add("is-enhanced");
  controls.querySelector("[data-prev]")!.addEventListener("click", () => {
    show(index - 1);
    schedule();
  });
  controls.querySelector("[data-next]")!.addEventListener("click", () => {
    show(index + 1);
    schedule();
  });
  pause.addEventListener("click", () => {
    paused = !paused;
    schedule();
  });
  root.addEventListener("mouseenter", () => {
    hovering = true;
    schedule();
  });
  root.addEventListener("mouseleave", () => {
    hovering = false;
    schedule();
  });
  root.addEventListener("focusin", () => {
    focused = true;
    schedule();
  });
  root.addEventListener("focusout", (event) => {
    focused = root.contains(event.relatedTarget as Node | null);
    schedule();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    show(index + (event.key === "ArrowLeft" ? -1 : 1));
    schedule();
  });
  document.addEventListener("visibilitychange", schedule);
  motion.addEventListener("change", () => {
    paused = motion.matches;
    schedule();
  });
  show(0);
  schedule();
}
