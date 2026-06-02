/* ═══════════════════════════════════════════════════════════════
   LYRICASTUDIOS — Main JavaScript
   ═══════════════════════════════════════════════════════════════ */

// Firebase
import './firebase.js';

document.addEventListener('DOMContentLoaded', () => {
  initPromoBanner();
  initStickyHeader();
  initMobileNav();
  initScrollAnimations();
  initReviewsCarousel();
  initFAQAccordion();
  initListenButton();
  initSmoothScroll();
});


/* ── Promo Banner ──────────────────────────────────────────── */
function initPromoBanner() {
  const banner = document.getElementById('promo-banner');
  const closeBtn = document.getElementById('promo-close');

  if (!banner || !closeBtn) return;

  closeBtn.addEventListener('click', () => {
    banner.classList.add('is-hidden');
  });
}


/* ── Sticky Header ─────────────────────────────────────────── */
function initStickyHeader() {
  const header = document.getElementById('header');
  if (!header) return;

  let lastScroll = 0;

  const onScroll = () => {
    const currentScroll = window.scrollY;

    if (currentScroll > 50) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }

    lastScroll = currentScroll;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}


/* ── Mobile Navigation ─────────────────────────────────────── */
function initMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const overlay = document.getElementById('mobile-nav-overlay');
  const closeBtn = document.getElementById('mobile-nav-close');
  const navLinks = document.querySelectorAll('.mobile-nav__link, .mobile-nav__cta');

  if (!hamburger || !overlay) return;

  const open = () => {
    overlay.classList.add('is-open');
    hamburger.classList.add('is-active');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  };

  const close = () => {
    overlay.classList.remove('is-open');
    hamburger.classList.remove('is-active');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  };

  hamburger.addEventListener('click', () => {
    if (overlay.classList.contains('is-open')) {
      close();
    } else {
      open();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  // Close on background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Close when a nav link is clicked
  navLinks.forEach(link => {
    link.addEventListener('click', close);
  });

  // Close on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
      close();
    }
  });
}


/* ── Scroll Animations (IntersectionObserver) ──────────────── */
function initScrollAnimations() {
  const elements = document.querySelectorAll('[data-animate]');
  if (!elements.length) return;

  // Respect reduced motion preferences
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const delay = entry.target.dataset.delay || 0;
          setTimeout(() => {
            entry.target.classList.add('is-visible');
          }, parseInt(delay));
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  elements.forEach(el => observer.observe(el));
}


/* ── Reviews Carousel ──────────────────────────────────────── */
function initReviewsCarousel() {
  const track = document.getElementById('carousel-track');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const dotsContainer = document.getElementById('carousel-dots');

  if (!track || !prevBtn || !nextBtn || !dotsContainer) return;

  const cards = track.querySelectorAll('.review-card');
  const totalCards = cards.length;
  let currentIndex = 0;
  let cardsPerView = getCardsPerView();
  let maxIndex = Math.max(0, totalCards - cardsPerView);
  let autoPlayTimer = null;
  let isTransitioning = false;
  let dragStartX = 0;

  function getCardsPerView() {
    const width = window.innerWidth;
    if (width <= 768) return 1;
    if (width <= 1024) return 2;
    return 3;
  }

  function buildDots() {
    dotsContainer.innerHTML = '';
    const dotCount = maxIndex + 1;
    for (let i = 0; i < dotCount; i++) {
      const dot = document.createElement('button');
      dot.classList.add('carousel-dot');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      if (i === currentIndex) dot.classList.add('is-active');
      dot.addEventListener('click', () => {
        stopAutoPlay();
        slideTo(i);
        startAutoPlay();
      });
      dotsContainer.appendChild(dot);
    }
  }

  function refreshDots() {
    const dots = dotsContainer.querySelectorAll('.carousel-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === currentIndex);
    });
  }

  function slideTo(index) {
    if (isTransitioning) return;
    currentIndex = Math.max(0, Math.min(index, maxIndex));

    const card = cards[0];
    if (!card) return;

    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    const cardWidth = card.offsetWidth + gap;
    const offset = currentIndex * cardWidth;

    isTransitioning = true;
    track.style.transition = `transform 500ms cubic-bezier(0.22, 1, 0.36, 1)`;
    track.style.transform = `translateX(-${offset}px)`;
    refreshDots();

    // Reset transitioning flag after animation completes
    setTimeout(() => {
      isTransitioning = false;
    }, 520);
  }

  function slideNext() {
    const nextIndex = currentIndex >= maxIndex ? 0 : currentIndex + 1;
    slideTo(nextIndex);
  }

  function slidePrev() {
    const prevIndex = currentIndex <= 0 ? maxIndex : currentIndex - 1;
    slideTo(prevIndex);
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimer = setInterval(() => {
      slideNext();
    }, 5000);
  }

  function stopAutoPlay() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
  }

  // Prev / Next buttons — stop autoplay FIRST, then navigate
  prevBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    stopAutoPlay();
    slidePrev();
    startAutoPlay();
  });

  nextBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    stopAutoPlay();
    slideNext();
    startAutoPlay();
  });

  // Touch / drag support
  let isDragging = false;

  track.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.pageX;
    stopAutoPlay();
  });

  track.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
  });

  track.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const diff = e.pageX - dragStartX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) slidePrev();
      else slideNext();
    }
    startAutoPlay();
  });

  track.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
    }
  });

  // Touch events for mobile
  track.addEventListener('touchstart', (e) => {
    dragStartX = e.touches[0].pageX;
    stopAutoPlay();
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].pageX - dragStartX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) slidePrev();
      else slideNext();
    }
    startAutoPlay();
  });

  // Pause autoplay on hover
  const carouselContainer = track.closest('.reviews-carousel');
  if (carouselContainer) {
    carouselContainer.addEventListener('mouseenter', stopAutoPlay);
    carouselContainer.addEventListener('mouseleave', startAutoPlay);
  }

  // Resize recalculation
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      cardsPerView = getCardsPerView();
      maxIndex = Math.max(0, totalCards - cardsPerView);
      if (currentIndex > maxIndex) currentIndex = maxIndex;
      buildDots();
      slideTo(currentIndex);
    }, 200);
  });

  // Initialize
  buildDots();
  slideTo(0);
  startAutoPlay();
}


/* ── FAQ Accordion ─────────────────────────────────────────── */
function initFAQAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-item__question');
    if (!question) return;

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');

      // Close all others
      faqItems.forEach(other => {
        if (other !== item) {
          other.classList.remove('is-open');
          const btn = other.querySelector('.faq-item__question');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current
      item.classList.toggle('is-open', !isOpen);
      question.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
    });
  });
}


/* ── Listen Button (visual only) ───────────────────────────── */
function initListenButton() {
  const listenBtn = document.getElementById('listen-btn');
  const listenIcon = document.getElementById('listen-icon');

  if (!listenBtn || !listenIcon) return;

  let isPlaying = false;

  listenBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;

    if (isPlaying) {
      listenIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg>
      `;
      listenBtn.querySelector('span:last-child').textContent = 'Now Playing...';
      listenIcon.style.animation = 'pulse-glow 2s ease-in-out infinite';
    } else {
      listenIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      `;
      listenBtn.querySelector('span:last-child').textContent = 'Listen to a Sample';
      listenIcon.style.animation = '';
    }
  });
}


/* ── Smooth Scroll ─────────────────────────────────────────── */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const headerHeight = document.getElementById('header')?.offsetHeight || 0;
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth',
      });
    });
  });
}
