interface Star {
  cx: number;
  cy: number;
  r: number;
  a: number;
  w: number;
  size: number;
  alpha: number;
  tw: number;
  twp: number;
  br: number;
  brp: number;
  drift: number;
}

const SPRITE_SIZE = 64;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function buildSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const g = c.getContext('2d');
  if (!g) return c;

  const grd = g.createRadialGradient(
    SPRITE_SIZE / 2, SPRITE_SIZE / 2, 0,
    SPRITE_SIZE / 2, SPRITE_SIZE / 2, SPRITE_SIZE / 2,
  );
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.1, 'rgba(226,250,255,1)');
  grd.addColorStop(0.22, 'rgba(120,238,255,0.85)');
  grd.addColorStop(0.42, 'rgba(34,211,238,0.40)');
  grd.addColorStop(0.7, 'rgba(34,211,238,0.10)');
  grd.addColorStop(1.0, 'rgba(34,211,238,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return c;
}

function buildStars(width: number, height: number): Star[] {
  const area = width * height;
  let n = Math.round(Math.min(260, Math.max(110, area / 8200)));
  if (width < 700) n = Math.round(n * 0.62);

  const stars: Star[] = [];
  for (let i = 0; i < n; i++) {
    const layer = Math.random();
    let size: number;
    let speed: number;
    let alpha: number;
    let radius: number;

    if (layer < 0.55) {
      size = rand(1.1, 2.4);
      speed = rand(0.045, 0.075);
      alpha = rand(0.34, 0.55);
      radius = rand(38, 170);
    } else if (layer < 0.88) {
      size = rand(2.2, 3.6);
      speed = rand(0.07, 0.115);
      alpha = rand(0.52, 0.74);
      radius = rand(60, 240);
    } else {
      size = rand(3.4, 5.6);
      speed = rand(0.1, 0.165);
      alpha = rand(0.72, 1.0);
      radius = rand(90, 300);
    }

    stars.push({
      cx: rand(-120, width + 120),
      cy: rand(-120, height + 120),
      r: radius,
      a: rand(0, Math.PI * 2),
      w: speed * (Math.random() < 0.5 ? 1 : -1),
      size,
      alpha,
      tw: rand(0.25, 0.9),
      twp: rand(0, Math.PI * 2),
      br: rand(0.04, 0.1),
      brp: rand(0, Math.PI * 2),
      drift: rand(0.002, 0.007),
    });
  }
  return stars;
}

export function initStars(canvas: HTMLCanvasElement): void {
  const maybe = canvas.getContext('2d', { alpha: true });
  if (!maybe) return;
  const ctx: CanvasRenderingContext2D = maybe;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let stars: Star[] = [];
  const sprite = buildSprite();
  let startTime = performance.now();
  let rafId: number | null = null;
  let paused = false;

  function draw(t: number, still: boolean): void {
    ctx.clearRect(0, 0, width, height);

    for (const s of stars) {
      const angle = s.a + (still ? 0 : s.w * t);
      const rr = s.r * (1 + s.br * Math.sin(t * 0.11 + s.brp));
      const cx = s.cx + (still ? 0 : Math.sin(t * s.drift + s.brp) * 18);
      const cy = s.cy + (still ? 0 : Math.cos(t * s.drift * 0.8 + s.a) * 14);

      const x = cx + Math.cos(angle) * rr;
      const y = cy + Math.sin(angle) * rr * 0.72;

      const tw = still ? 0 : Math.sin(t * s.tw + s.twp);
      const alpha = s.alpha * (0.8 + 0.2 * tw);
      if (alpha <= 0.01) continue;

      if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;

      const d = s.size * 4.6;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
    }

    ctx.globalAlpha = 1;
  }

  function frame(now: number): void {
    if (paused) return;
    draw((now - startTime) / 1000, false);
    rafId = window.requestAnimationFrame(frame);
  }

  function start(): void {
    if (rafId !== null || reduceMotion.matches) return;
    startTime = performance.now();
    rafId = window.requestAnimationFrame(frame);
  }

  function stop(): void {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function resize(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = buildStars(width, height);
    if (reduceMotion.matches) draw(0, true);
  }

  resize();
  start();

  let resizeTimer: number | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      stop();
      resize();
      start();
    }, 180);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      paused = true;
      stop();
    } else {
      paused = false;
      start();
    }
  });

  reduceMotion.addEventListener?.('change', () => {
    if (reduceMotion.matches) {
      stop();
      draw(0, true);
    } else {
      start();
    }
  });
}
