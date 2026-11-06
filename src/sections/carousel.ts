const AUTOPLAY_MS = 4200;

const SWIPE_THRESHOLD = 44;

export interface CarouselOptions {
  intervalMs?: number;
}

export function initCarousel(root: ParentNode, options: CarouselOptions = {}): void {
  const intervalMs = options.intervalMs ?? AUTOPLAY_MS;

  const slides = Array.from(root.querySelectorAll<HTMLElement>('.sl'));
  const thumbs = Array.from(root.querySelectorAll<HTMLElement>('.th'));
  const counter = root.querySelector<HTMLElement>('#cur');
  const stage = root.querySelector<HTMLElement>('.stage');

  if (slides.length === 0) return;

  const count = slides.length;
  let index = 0;
  let timer: number | null = null;
  let touchStartX: number | null = null;

  function show(next: number): void {
    index = (next + count) % count;
    slides.forEach((slide, i) => slide.classList.toggle('on', i === index));
    thumbs.forEach((thumb, i) => thumb.classList.toggle('on', i === index));
    if (counter) counter.textContent = ('0' + (index + 1)).slice(-2);
  }

  function stop(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function play(): void {
    stop();
    timer = window.setInterval(() => show(index + 1), intervalMs);
  }

  root.querySelector('#prev')?.addEventListener('click', () => {
    show(index - 1);
    play();
  });
  root.querySelector('#next')?.addEventListener('click', () => {
    show(index + 1);
    play();
  });

  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      show(Number(thumb.dataset['i'] ?? 0));
      play();
    });
  });

  stage?.addEventListener('mouseenter', stop);
  stage?.addEventListener('mouseleave', play);
  stage?.addEventListener('focusin', stop);
  stage?.addEventListener('focusout', play);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  stage?.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.touches[0]?.clientX ?? null;
    },
    { passive: true },
  );
  stage?.addEventListener(
    'touchend',
    (e) => {
      if (touchStartX === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) show(dx < 0 ? index + 1 : index - 1);
      touchStartX = null;
    },
    { passive: true },
  );

  show(0);
  play();
}
