const STAGGER_MS = 45;

export function initProgressBars(root: ParentNode): void {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('tbody tr'));
  if (rows.length === 0) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function fill(bar: HTMLElement, delay: number): void {
    const target = bar.style.width;
    bar.style.width = '0';
    if (reduceMotion.matches) {
      bar.style.width = target;
      return;
    }
    window.setTimeout(() => {
      bar.style.width = target;
    }, delay);
  }

  if (typeof IntersectionObserver !== 'function') {
    rows.forEach((row) => {
      row.querySelectorAll<HTMLElement>('.mv b').forEach((bar) => {
        bar.style.width = bar.style.width || '0%';
      });
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const row = entry.target as HTMLElement;
        row.querySelectorAll<HTMLElement>('.mv b').forEach((bar, k) => {
          fill(bar, k * STAGGER_MS);
        });
        observer.unobserve(row);
      });
    },
    { threshold: 0.15 },
  );

  rows.forEach((row) => observer.observe(row));
}
