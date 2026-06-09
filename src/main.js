/* ═══════════════════════════════════════════════════════════════
   LYRICASTUDIOS — Main JavaScript
   ═══════════════════════════════════════════════════════════════ */

import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore';

// Registry to ensure only one audio sample plays at a time
const activePlayers = [];

function registerPlayer(pauseFn) {
  activePlayers.push(pauseFn);
}

function pauseAllPlayers(exceptPauseFn) {
  activePlayers.forEach(pauseFn => {
    if (pauseFn !== exceptPauseFn) {
      pauseFn();
    }
  });
}

const initAll = () => {
  initPromoBanner();
  initStickyHeader();
  initMobileNav();
  initScrollAnimations();
  initReviewsCarousel();
  initFAQAccordion();
  initListenButton();
  initWygPlayer();
  initSotyPlayer();
  initSmoothScroll();
  initHeroSlideshow();
  initSongModal();
  initHeroTypewriter();
  initCategoryCards();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}


/* ── Promo Banner — Close on click, hide on scroll ─────────── */
function initPromoBanner() {
  const banner = document.getElementById('promo-banner');
  const closeBtn = document.getElementById('promo-close');

  if (!banner || !closeBtn) return;

  // Close on button click
  closeBtn.addEventListener('click', () => {
    banner.classList.add('is-hidden');
  });

  // Hide on scroll down, show on scroll up
  let lastScroll = 0;
  const scrollThreshold = 80;

  window.addEventListener('scroll', () => {
    if (banner.classList.contains('is-closed')) return; // permanently closed

    const currentScroll = window.scrollY;

    if (currentScroll > scrollThreshold) {
      banner.classList.add('is-hidden');
    } else {
      banner.classList.remove('is-hidden');
    }

    lastScroll = currentScroll;
  }, { passive: true });

  // Mark as permanently closed when X is clicked
  closeBtn.addEventListener('click', () => {
    banner.classList.add('is-closed');
  });
}


/* ── Sticky Header — Scroll state for CTA reveal ──────────── */
function initStickyHeader() {
  const header = document.getElementById('header');
  if (!header) return;

  const onScroll = () => {
    const currentScroll = window.scrollY;

    if (currentScroll > 120) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}


/* ── Mobile Navigation ─────────────────────────────────────── */
function initMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const pill = document.getElementById('header-pill');
  const overlay = document.getElementById('mobile-nav-overlay');
  const navLinks = document.querySelectorAll('.nav__link, .mobile-only-cta');

  if (!hamburger || !pill || !overlay) return;

  const open = () => {
    pill.classList.add('is-animating');
    requestAnimationFrame(() => {
      pill.classList.add('is-open');
      overlay.classList.add('is-open');
      hamburger.classList.add('is-active');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('nav-open');
    });
    // Remove animating class after transition completes
    setTimeout(() => pill.classList.remove('is-animating'), 250);
  };

  const close = () => {
    pill.classList.add('is-animating');
    pill.classList.remove('is-open');
    overlay.classList.remove('is-open');
    hamburger.classList.remove('is-active');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    // Remove animating class after transition completes
    setTimeout(() => pill.classList.remove('is-animating'), 250);
  };

  hamburger.addEventListener('click', () => {
    if (pill.classList.contains('is-open')) {
      close();
    } else {
      open();
    }
  });

  // Close on backdrop overlay click
  overlay.addEventListener('click', close);

  // Close when nav links are clicked
  navLinks.forEach(link => {
    link.addEventListener('click', close);
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pill.classList.contains('is-open')) {
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
    track.style.transition = `transform 400ms cubic-bezier(0.22, 1, 0.36, 1)`;
    track.style.transform = `translateX(-${offset}px)`;
    refreshDots();

    setTimeout(() => {
      isTransitioning = false;
    }, 420);
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

  const audio = new Audio('/mp3/Hands That Never Let Go.mp3');
  let isPlaying = false;

  const playSvg = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  `;

  const pauseSvg = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  `;

  const updateUI = () => {
    if (isPlaying) {
      listenIcon.innerHTML = pauseSvg;
      listenBtn.querySelector('.listen-text').textContent = 'Now Playing...';
      listenBtn.classList.add('is-playing');
    } else {
      listenIcon.innerHTML = playSvg;
      listenBtn.querySelector('.listen-text').textContent = 'Listen to a Sample';
      listenBtn.classList.remove('is-playing');
    }
  };

  const playAudio = async () => {
    pauseAllPlayers(pauseAudio);
    try {
      await audio.play();
      isPlaying = true;
      updateUI();
    } catch (e) {
      console.log('Audio play failed', e);
    }
  };

  const pauseAudio = () => {
    audio.pause();
    isPlaying = false;
    updateUI();
  };

  registerPlayer(pauseAudio);

  // Click to toggle play/pause (same for desktop and mobile)
  listenBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  });

  // Handle audio end
  audio.addEventListener('ended', () => {
    isPlaying = false;
    updateUI();
  });
}


/* ── What You Get Audio Player ───────────────────────────── */
function initWygPlayer() {
  const wygBtn = document.getElementById('wyg-play-btn');
  const wygIcon = document.getElementById('wyg-play-icon');
  const progressBar = document.getElementById('wyg-progress-bar');
  const progressFill = document.getElementById('wyg-progress-fill');
  const currentTimeEl = document.getElementById('wyg-current-time');
  const totalTimeEl = document.getElementById('wyg-total-time');
  
  if (!wygBtn || !wygIcon) return;
  
  const audio = new Audio('/mp3/The Way Back.mp3');
  let isPlaying = false;
  
  const playSvg = `
    <polygon points="5 3 19 12 5 21 5 3" />
  `;
  
  const pauseSvg = `
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>
  `;
  
  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  audio.addEventListener('loadedmetadata', () => {
    if (totalTimeEl) totalTimeEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('timeupdate', () => {
    if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
    if (progressFill && audio.duration) {
      const progress = (audio.currentTime / audio.duration) * 100;
      progressFill.style.width = `${progress}%`;
    }
  });

  if (progressBar) {
    progressBar.addEventListener('click', (e) => {
      if (!audio.duration) return;
      const rect = progressBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const skipTo = (clickX / width) * audio.duration;
      audio.currentTime = skipTo;
    });
  }

  const pauseAudio = () => {
    audio.pause();
    wygIcon.innerHTML = playSvg;
    isPlaying = false;
  };

  const playAudio = () => {
    pauseAllPlayers(pauseAudio);
    audio.play().then(() => {
      wygIcon.innerHTML = pauseSvg;
      isPlaying = true;
    }).catch(err => console.log('Audio play failed', err));
  };

  registerPlayer(pauseAudio);

  wygBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  });

  audio.addEventListener('ended', () => {
    wygIcon.innerHTML = playSvg;
    isPlaying = false;
    if (progressFill) progressFill.style.width = '0%';
    if (currentTimeEl) currentTimeEl.textContent = '0:00';
  });
}

/* ── Song of the Year Player ────────────────────────────── */
function initSotyPlayer() {
  const sotyBtn = document.getElementById('soty-play-btn');
  const sotyIcon = document.getElementById('soty-play-icon');
  const sotyVinyl = document.getElementById('soty-vinyl-wrapper')?.querySelector('.soty-vinyl');
  const sotyVisualizer = document.getElementById('soty-visualizer');
  const glassCard = document.querySelector('.soty-player__glass');
  
  if (!sotyBtn || !sotyIcon || !sotyVinyl) return;
  
  if (glassCard) {
    glassCard.addEventListener('mousemove', (e) => {
      const rect = glassCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      glassCard.style.setProperty('--mouse-x', `${x}px`);
      glassCard.style.setProperty('--mouse-y', `${y}px`);
    });
  }
  
  const audio = new Audio('/mp3/Grace In Your Smile.mp3');
  let isPlaying = false;
  
  const playSvg = `
    <polygon points="5 3 19 12 5 21 5 3" />
  `;
  
  const pauseSvg = `
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>
  `;
  
  const pauseAudio = () => {
    audio.pause();
    sotyIcon.innerHTML = playSvg;
    sotyVinyl.classList.remove('is-playing');
    if (sotyVisualizer) sotyVisualizer.classList.remove('is-playing');
    isPlaying = false;
  };

  const playAudio = () => {
    pauseAllPlayers(pauseAudio);
    audio.play().then(() => {
      sotyIcon.innerHTML = pauseSvg;
      sotyVinyl.classList.add('is-playing');
      if (sotyVisualizer) sotyVisualizer.classList.add('is-playing');
      isPlaying = true;
    }).catch(err => console.log('Audio play failed', err));
  };

  registerPlayer(pauseAudio);

  sotyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  });

  audio.addEventListener('ended', () => {
    sotyIcon.innerHTML = playSvg;
    sotyVinyl.classList.remove('is-playing');
    if (sotyVisualizer) sotyVisualizer.classList.remove('is-playing');
    isPlaying = false;
  });
}


/* ── Smooth Scroll ─────────────────────────────────────────── */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      if (this.hasAttribute('data-open-modal')) return;

      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const headerPill = document.getElementById('header-pill');
      const headerHeight = headerPill ? headerPill.offsetHeight : 60;
      const headerTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-top')) || 24;
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - headerTop - 20;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth',
      });
    });
  });
}


/* ── Hero Slideshow ────────────────────────────────────────── */
function initHeroSlideshow() {
  const slides = document.querySelectorAll('.hero__slide');
  if (slides.length <= 1) return;

  let currentSlide = 0;

  setInterval(() => {
    slides[currentSlide].classList.remove('is-active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('is-active');
  }, 3000);
}


/* ── Song Creation Modal ───────────────────────────────────────── */
function initSongModal() {
  const modal = document.getElementById('song-modal');
  const closeBtn = document.getElementById('modal-close');
  const backBtn = document.getElementById('modal-back');
  const nextBtn = document.getElementById('modal-next');
  const progressFill = document.getElementById('modal-progress-fill');
  const stepLabel = document.getElementById('modal-step-label');
  const percentLabel = document.getElementById('modal-percent-label');

  if (!modal || !closeBtn || !backBtn || !nextBtn) return;

  const totalSteps = 5;
  let currentStep = 1;

  // ── Trigger buttons ─────────────────────────────
  const triggers = document.querySelectorAll('[data-open-modal]');
  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  // ── Close (X button only, not backdrop) ──────────
  closeBtn.addEventListener('click', closeModal);

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  // ── Navigation ──────────────────────────────────
  backBtn.addEventListener('click', () => {
    if (currentStep > 1) {
      goToStep(currentStep - 1, 'backward');
    }
  });

  nextBtn.addEventListener('click', () => {
    if (!validateStep(currentStep)) return;

    if (currentStep < totalSteps) {
      goToStep(currentStep + 1, 'forward');
    }
  });

  // ── Step 5 custom buttons ──────────────────────
  const checkoutSubmitBtn = document.getElementById('checkout-submit-btn');
  const checkoutBackLink = document.getElementById('checkout-back-link');

  if (checkoutSubmitBtn) {
    checkoutSubmitBtn.addEventListener('click', () => {
      submitForm();
    });
  }

  if (checkoutBackLink) {
    checkoutBackLink.addEventListener('click', () => {
      goToStep(4, 'backward');
    });
  }

  // ── Chip selection (single-select per group) ────
  modal.querySelectorAll('.song-modal__chips, .song-modal__chips--genre').forEach(group => {
    group.querySelectorAll('.song-modal__chip').forEach(chip => {
      chip.addEventListener('click', () => {
        // Deselect all siblings in this group
        group.querySelectorAll('.song-modal__chip').forEach(c => c.classList.remove('is-selected'));
        // Select clicked
        chip.classList.add('is-selected');
      });
    });
  });

  // ── Plan Card Selection ──────────────────────────
  const planCards = modal.querySelectorAll('.song-modal__plan-card');
  planCards.forEach(card => {
    card.addEventListener('click', () => {
      planCards.forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
    });

    const selectBtn = card.querySelector('.song-modal__plan-select');
    if (selectBtn) {
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        planCards.forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
      });
    }
  });

  // ── Hype Intro Elements ─────────────────────────
  const introScreen = document.getElementById('song-modal-intro');
  const introContent = document.getElementById('intro-content');
  const introLoader = document.getElementById('intro-loader');
  const introLoaderText = document.getElementById('intro-loader-text');
  const btnHypeStart = document.getElementById('btn-hype-start');
  let introTimers = [];

  // ── Open Modal ──────────────────────────────────
  function openModal() {
    resetModal();
    modal.style.display = ''; // Ensure no leftover inline display styles block the modal
    modal.classList.add('is-open');
    modal.classList.add('has-intro');
    document.body.classList.add('modal-open');
    // Set initial direction
    modal.setAttribute('data-direction', 'forward');

    // Reset intro to initial state
    if (introContent) {
      introContent.classList.remove('is-hidden');
    }
    if (introLoader) {
      introLoader.classList.remove('is-active');
    }
  }

  // ── Hype Start Button ──────────────────────────
  if (btnHypeStart) {
    btnHypeStart.addEventListener('click', () => {
      startStudioLoader();
    });
  }

  function startStudioLoader() {
    // Clear any previous timers
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];

    // Fade out intro content, show loader
    if (introContent) introContent.classList.add('is-hidden');

    introTimers.push(setTimeout(() => {
      if (introLoader) introLoader.classList.add('is-active');

      const messages = [
        'Tuning the instruments...',
        'Warming up the microphone...',
        'Hiring the band...',
        'Setting the mood lighting...',
        'Ready! Let\'s create your masterpiece!'
      ];

      let msgIndex = 0;

      const msgInterval = setInterval(() => {
        msgIndex++;
        if (msgIndex < messages.length) {
          if (introLoaderText) {
            introLoaderText.style.opacity = '0';
            setTimeout(() => {
              introLoaderText.textContent = messages[msgIndex];
              introLoaderText.style.opacity = '1';
            }, 150);
          }
        }
        if (msgIndex >= messages.length - 1) {
          clearInterval(msgInterval);
        }
      }, 350);

      // After all messages, transition to Step 1
      introTimers.push(setTimeout(() => {
        modal.classList.remove('has-intro');
        goToStep(1, 'forward');
      }, 1800));
    }, 380));
  }

  // ── Close Modal ─────────────────────────────────
  function closeModal() {
    modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');
  }

  // ── Go To Step ──────────────────────────────────
  function goToStep(step, direction) {
    currentStep = step;
    modal.setAttribute('data-direction', direction);

    // Switch visible step
    const steps = modal.querySelectorAll('.song-modal__step');
    steps.forEach(s => s.classList.remove('is-active'));
    const target = modal.querySelector(`[data-step="${step}"]`);
    if (target) target.classList.add('is-active');

    // Update progress bar
    const percent = Math.round((step / totalSteps) * 100);
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (stepLabel) stepLabel.textContent = `Step ${step} of ${totalSteps}`;
    if (percentLabel) percentLabel.textContent = `${percent}% Complete`;

    // Show/hide standard footer and terms on step 5
    const footer = modal.querySelector('.song-modal__footer');
    const terms = modal.querySelector('.song-modal__terms');
    if (step === 5) {
      if (footer) footer.style.display = 'none';
      if (terms) terms.style.display = 'none';
    } else {
      if (footer) footer.style.display = 'flex';
      if (terms) terms.style.display = 'block';

      // Show/hide back button
      backBtn.classList.toggle('is-hidden', step === 1);

      // Update next button text on Step 4
      const nextText = nextBtn.querySelector('span');
      if (step === 4) {
        nextText.textContent = 'Next: Review Order';
      } else {
        nextText.textContent = 'Next';
      }
    }

    // Scroll container to top
    modal.querySelector('.song-modal__container').scrollTop = 0;
  }

  // ── Validation ──────────────────────────────────
  function validateStep(step) {
    if (step === 1) {
      const selected = modal.querySelector('[data-group="recipient"] .song-modal__chip.is-selected');
      if (!selected) {
        shakeElement(modal.querySelector('[data-group="recipient"]'));
        return false;
      }
    }
    if (step === 2) {
      const selected = modal.querySelector('[data-group="occasion"] .song-modal__chip.is-selected');
      if (!selected) {
        shakeElement(modal.querySelector('[data-group="occasion"]'));
        return false;
      }
    }
    if (step === 3) {
      const genreSelected = modal.querySelector('[data-group="genre"] .song-modal__chip.is-selected');
      const moodSelected = modal.querySelector('[data-group="mood"] .song-modal__chip.is-selected');

      let isValid = true;
      if (!genreSelected) {
        shakeElement(modal.querySelector('[data-group="genre"]'));
        isValid = false;
      }
      if (!moodSelected) {
        shakeElement(modal.querySelector('[data-group="mood"]'));
        isValid = false;
      }
      return isValid;
    }
    return true;
  }

  function shakeElement(el) {
    if (!el) return;
    el.classList.remove('shake');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
  }

  // ── Submit ──────────────────────────────────────
  async function submitForm() {
    const recipientChip = modal.querySelector('[data-group="recipient"] .song-modal__chip.is-selected');
    const pronounsChip = modal.querySelector('[data-group="pronouns"] .song-modal__chip.is-selected');
    const occasionChip = modal.querySelector('[data-group="occasion"] .song-modal__chip.is-selected');
    const genreChip = modal.querySelector('[data-group="genre"] .song-modal__chip.is-selected');
    const moodChip = modal.querySelector('[data-group="mood"] .song-modal__chip.is-selected');

    const formData = {
      recipient: recipientChip ? recipientChip.dataset.value : '',
      name: (document.getElementById('recipient-name') || {}).value || '',
      pronouns: pronounsChip ? pronounsChip.dataset.value : '',
      occasion: occasionChip ? occasionChip.dataset.value : '',
      occasionStory: (document.getElementById('occasion-story') || {}).value || '',
      genre: genreChip ? genreChip.dataset.value : '',
      mood: moodChip ? moodChip.dataset.value : '',
      memories: (document.getElementById('memories-jokes') || {}).value || '',
      words: [
        (document.getElementById('word-1') || {}).value || '',
        (document.getElementById('word-2') || {}).value || '',
        (document.getElementById('word-3') || {}).value || '',
      ].filter(Boolean),
      plan: 'standard',
      price: '$79'
    };

    console.log('Song Creation Checkout Form Submitted:', formData);

    // Instead of writing to DB right away, we intercept and open the payment modal
    // We store the data globally to be used by the payment script
    window.currentOrderData = formData;

    const paymentModal = document.getElementById('payment-modal');
    if (paymentModal) {
      paymentModal.style.display = 'flex';
    } else {
      alert("We just deployed the new payment system! Please completely refresh your browser page (F5 or Ctrl+R) to load the new checkout interface.");
    }
  }

  // ── Reset ───────────────────────────────────────
  function resetModal() {
    currentStep = 1;

    // Clear intro timers
    introTimers.forEach(t => clearTimeout(t));
    introTimers = [];

    // Reset intro screen
    modal.classList.remove('has-intro');
    if (introContent) introContent.classList.remove('is-hidden');
    if (introLoader) introLoader.classList.remove('is-active');
    if (introLoaderText) {
      introLoaderText.textContent = 'Setting up your private studio...';
      introLoaderText.style.opacity = '1';
    }

    // Reset steps visibility
    const steps = modal.querySelectorAll('.song-modal__step');
    steps.forEach(s => s.classList.remove('is-active'));
    const firstStep = modal.querySelector('[data-step="1"]');
    if (firstStep) firstStep.classList.add('is-active');

    // Reset progress
    if (progressFill) progressFill.style.width = '20%';
    if (stepLabel) stepLabel.textContent = 'Step 1 of 5';
    if (percentLabel) percentLabel.textContent = '20% Complete';

    // Show footer and terms
    const footer = modal.querySelector('.song-modal__footer');
    const terms = modal.querySelector('.song-modal__terms');
    if (footer) footer.style.display = 'flex';
    if (terms) terms.style.display = 'block';

    // Hide back button
    backBtn.classList.add('is-hidden');

    // Reset next button
    const nextText = nextBtn.querySelector('span');
    const nextSvg = nextBtn.querySelector('svg');
    if (nextText) nextText.textContent = 'Next';
    if (nextSvg) nextSvg.style.display = '';

    // Deselect all chips
    modal.querySelectorAll('.song-modal__chip').forEach(c => c.classList.remove('is-selected'));

    // Clear inputs
    modal.querySelectorAll('.song-modal__input, .song-modal__textarea').forEach(input => {
      input.value = '';
    });
  }
}

// ── Payment Modal Logic ───────────────────────────────────
function initPaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('close-payment-modal');
  const tabs = modal.querySelectorAll('.pay-tab');
  const sections = modal.querySelectorAll('.pay-method-section');
  const payForm = document.getElementById('payment-form');
  const btnPayStripe = document.getElementById('btn-pay-stripe');
  const btnPayPaypal = document.getElementById('btn-pay-paypal');
  const loadingOverlay = document.getElementById('payment-loading');
  const errorMsg = document.getElementById('payment-error');

  // Close Modal
  const closePayment = () => {
    modal.style.display = 'none';
    errorMsg.style.display = 'none';
    if (payForm) payForm.reset();
  };

  closeBtn.addEventListener('click', closePayment);
  window.addEventListener('click', (e) => {
    if (e.target === modal) closePayment();
  });

  // Tab Switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const method = tab.dataset.method;
      sections.forEach(sec => sec.style.display = 'none');
      document.getElementById(`pay-method-${method}`).style.display = 'block';
    });
  });

  // Mock Payment Processing
  const processPayment = (e) => {
    if (e) e.preventDefault();
    errorMsg.style.display = 'none';
    loadingOverlay.style.display = 'flex';

    // Check for the mock failure card
    const cardInput = document.getElementById('pay-card');
    const isMockFailure = (cardInput && cardInput.value.replace(/\s+/g, '') === '4000000000000000');

    setTimeout(async () => {
      if (isMockFailure) {
        loadingOverlay.style.display = 'none';
        errorMsg.textContent = 'Transaction declined by bank. Please try a different card.';
        errorMsg.style.display = 'block';
      } else {
        // Success
        try {
          if (!window.currentOrderData) throw new Error("No order data found");

          await addDoc(collection(db, 'orders'), {
            customerData: window.currentOrderData,
            status: 'Pending Assignment',
            assignedArtistId: null,
            timestamps: {
              createdAt: serverTimestamp()
            },
            assets: {}
          });

          loadingOverlay.style.display = 'none';
          alert('Payment Successful! Your song order has been sent to our artists.');
          closePayment();

          // Close the original song modal too
          const songModal = document.getElementById('song-modal');
          if (songModal) {
            songModal.classList.remove('is-open');
            document.body.classList.remove('modal-open');
          }

          window.currentOrderData = null;
        } catch (error) {
          loadingOverlay.style.display = 'none';
          console.error("Error creating order: ", error);
          errorMsg.textContent = "An error occurred while creating your order. Please try again.";
          errorMsg.style.display = 'block';
        }
      }
    }, 2000); // 2 second mock delay
  };

  if (payForm) payForm.addEventListener('submit', processPayment);
  if (btnPayStripe) btnPayStripe.addEventListener('click', processPayment);
  if (btnPayPaypal) btnPayPaypal.addEventListener('click', processPayment);
}

document.addEventListener('DOMContentLoaded', initPaymentModal);

/* ── Live Support Widget Logic ────────────────────────────── */
function initSupportWidget() {
  const widget = document.getElementById('support-widget');
  const fab = document.getElementById('support-fab');
  const closeBtn = document.getElementById('close-support');
  const messagesContainer = document.getElementById('support-messages');
  const form = document.getElementById('support-form');
  const input = document.getElementById('support-input');
  const iconChat = fab.querySelector('.icon-chat');
  const iconClose = fab.querySelector('.icon-close');

  if (!widget || !fab || !form) return;

  // Session Management
  let sessionId = localStorage.getItem('supportSessionId');
  if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('supportSessionId', sessionId);
  }

  let unsubscribe = null;
  let hasOpened = false;

  const toggleWidget = () => {
    const isOpen = widget.classList.contains('is-open');
    if (isOpen) {
      widget.classList.remove('is-open');
      iconChat.style.display = 'block';
      iconClose.style.display = 'none';
    } else {
      widget.classList.add('is-open');
      iconChat.style.display = 'none';
      iconClose.style.display = 'block';
      input.focus();

      if (!hasOpened) {
        hasOpened = true;
        listenToMessages();
      }
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  fab.addEventListener('click', toggleWidget);
  closeBtn.addEventListener('click', toggleWidget);

  const scrollToBottom = () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  const renderMessage = (text, sender) => {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('support-msg');
    msgDiv.classList.add(sender === 'user' ? 'user' : 'bot');
    msgDiv.textContent = text;
    messagesContainer.appendChild(msgDiv);
    scrollToBottom();
  };

  const listenToMessages = () => {
    const messagesRef = collection(db, 'support_messages');
    const q = query(messagesRef, where('sessionId', '==', sessionId));

    unsubscribe = onSnapshot(q, (snapshot) => {
      messagesContainer.innerHTML = '';

      if (snapshot.empty) {
        // Initial bot greeting
        renderMessage("Hi there! Welcome to Lyricastudios. How can we help you create your perfect song today?", 'bot');
        renderQuickReplies();
      } else {
        if (quickRepliesContainer) quickRepliesContainer.style.display = 'none';
        const msgs = [];
        snapshot.forEach(docSnap => {
          msgs.push(docSnap.data());
        });
        msgs.sort((a, b) => {
          const tA = a.timestamp && typeof a.timestamp.toMillis === 'function' ? a.timestamp.toMillis() : Date.now();
          const tB = b.timestamp && typeof b.timestamp.toMillis === 'function' ? b.timestamp.toMillis() : Date.now();
          return tA - tB;
        });

        msgs.forEach(data => {
          renderMessage(data.text, data.sender);
        });
      }
    }, (error) => {
      console.error("Support widget snapshot error:", error);
    });
  };

  const quickRepliesContainer = document.getElementById('support-quick-replies');
  const presets = [
    { label: 'Pricing & Plans', question: 'What are your pricing and plans?', answer: 'Our standard plan is $79 for a full custom song. We also offer premium options during checkout!' },
    { label: 'Turnaround Time', question: 'How long does it take?', answer: 'Usually, our artists deliver your custom song within 3-5 days!' },
    { label: 'Revisions', question: 'Do you offer revisions?', answer: 'Yes! We want you to be 100% happy, so we offer reasonable revisions to get the song just right.' },
  ];

  const renderQuickReplies = () => {
    if (!quickRepliesContainer) return;
    quickRepliesContainer.innerHTML = '';
    quickRepliesContainer.style.display = 'flex';
    presets.forEach(preset => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-reply-btn';
      btn.textContent = preset.label;
      btn.onclick = () => handlePresetClick(preset);
      quickRepliesContainer.appendChild(btn);
    });
  };

  const handlePresetClick = async (preset) => {
    if (quickRepliesContainer) quickRepliesContainer.style.display = 'none';

    renderMessage(preset.question, 'user');

    try {
      const sessionRef = doc(db, 'support_sessions', sessionId);
      await setDoc(sessionRef, {
        lastMessage: preset.question,
        lastMessageTime: serverTimestamp(),
        createdAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, 'support_messages'), {
        sessionId,
        sender: 'user',
        text: preset.question,
        timestamp: serverTimestamp()
      });

      // Simulate bot typing delay
      setTimeout(async () => {
        renderMessage(preset.answer, 'bot');
        await setDoc(sessionRef, {
          lastMessage: preset.answer,
          lastMessageTime: serverTimestamp()
        }, { merge: true });

        await addDoc(collection(db, 'support_messages'), {
          sessionId,
          sender: 'admin',
          text: preset.answer,
          timestamp: serverTimestamp()
        });
      }, 1000);
    } catch (err) {
      console.error(err);
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = '';

    // Optimistic UI
    renderMessage(text, 'user');

    try {
      // Create or update session
      const sessionRef = doc(db, 'support_sessions', sessionId);
      console.log('[Support Widget] Sending message. SessionId:', sessionId, 'Text:', text);
      await setDoc(sessionRef, {
        lastMessage: text,
        lastMessageTime: serverTimestamp(),
        createdAt: serverTimestamp() // setDoc with merge will overwrite this if not careful, but for simplicity it's fine
      }, { merge: true });
      console.log('[Support Widget] Session doc created/updated successfully.');

      // Add message
      await addDoc(collection(db, 'support_messages'), {
        sessionId,
        sender: 'user',
        text,
        timestamp: serverTimestamp()
      });
      console.log('[Support Widget] Message doc added successfully.');

    } catch (err) {
      console.error("[Support Widget] Error sending message", err);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupportWidget);
} else {
  initSupportWidget();
}

/* ── Hero Title Typewriter ────────────────────────────── */
function initHeroTypewriter() {
  const typewriterSpan = document.querySelector('.hero__title .typewriter-text');
  const cursorSpan = document.querySelector('.hero__title .typewriter-cursor');
  if (!typewriterSpan) return;

  const words = [
    "Beautiful Song",
    "Personalized Track",
    "Custom Song",
    "Heartfelt Gift"
  ];
  let wordIndex = 0;
  let charIndex = words[0].length;
  let isDeleting = true;
  let typingSpeed = 100;
  let delayAfterWord = 2000;

  function createSplashNote() {
    if (!cursorSpan) return;
    const note = document.createElement('span');
    const notes = ['♪', '♫', '♬', '♩'];
    note.textContent = notes[Math.floor(Math.random() * notes.length)];
    note.classList.add('splash-note', 'text-gradient');
    const rect = cursorSpan.getBoundingClientRect();
    const startX = rect.left + window.scrollX + (Math.random() * 10 - 5);
    
    // Start notes at the vertical center of the text so they look closer to the baseline
    const centerY = rect.top + window.scrollY + rect.height / 2;
    const startY = centerY + (Math.random() * 10 - 5);

    note.style.left = `${startX}px`;
    note.style.top = `${startY}px`;

    // 50% chance to splash up, 50% to splash down
    const splashUp = Math.random() > 0.5;
    const tx = (Math.random() * 40 - 20) + 'px';
    const ty = splashUp
      ? -(Math.random() * 35 + 25) + 'px' // move up further
      : (Math.random() * 25 + 15) + 'px';  // move down
    const rot = (Math.random() * 60 - 30) + 'deg';

    note.style.setProperty('--tx', tx);
    note.style.setProperty('--ty', ty);
    note.style.setProperty('--rot', rot);

    document.body.appendChild(note);

    setTimeout(() => {
      if (note.parentNode) {
        note.remove();
      }
    }, 400);
  }

  function type() {
    const currentWord = words[wordIndex];

    if (isDeleting) {
      typewriterSpan.textContent = currentWord.substring(0, charIndex - 1);
      charIndex--;
      typingSpeed = 30;
    } else {
      typewriterSpan.textContent = currentWord.substring(0, charIndex + 1);
      charIndex++;
      typingSpeed = 80;
      createSplashNote();
    }

    if (!isDeleting && charIndex === currentWord.length) {
      isDeleting = true;
      setTimeout(type, delayAfterWord);
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      setTimeout(type, 500);
    } else {
      setTimeout(type, typingSpeed);
    }
  }

  setTimeout(type, delayAfterWord);
}

/* ── Category Cards Touch/Tap Toggle ─────────────────────────── */
function initCategoryCards() {
  const cards = document.querySelectorAll('.category-card');
  if (!cards.length) return;

  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      // If the target is the CTA button link, let data-open-modal handle it
      if (e.target.closest('.category-card__link')) {
        return;
      }

      // Check if touch device (no hover pointer)
      const isTouch = window.matchMedia('(hover: none)').matches;
      if (isTouch) {
        e.preventDefault();
        e.stopPropagation();

        const isActive = card.classList.contains('is-active');

        // Close all other active cards
        cards.forEach(c => {
          if (c !== card) c.classList.remove('is-active');
        });

        // Toggle active state on current card
        card.classList.toggle('is-active', !isActive);
      }
    });
  });

  // Tap outside to close active cards on touch devices
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.category-card')) {
      cards.forEach(c => c.classList.remove('is-active'));
    }
  });
}

