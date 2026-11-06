import './styles/tokens.css';
import './styles/base.css';
import './styles/hero.css';
import './styles/footer.css';
import './styles/final.css';

import { initCarousel } from './sections/carousel.ts';
import { initProgressBars } from './sections/progress-bars.ts';
import { initStars } from './sections/stars.ts';
import { initTermsModal } from './sections/terms-modal.ts';

async function boot(): Promise<void> {
  document.documentElement.dataset['js'] = 'on';

  const starCanvas = document.getElementById('stars');
  if (starCanvas instanceof HTMLCanvasElement) initStars(starCanvas);

  initCarousel(document);
  initProgressBars(document);
  initTermsModal(document);

}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot());
} else {
  void boot();
}
