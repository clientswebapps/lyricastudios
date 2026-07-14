/* ═══════════════════════════════════════════════════════════════
   LYRICASTUDIOS — Main JavaScript
   ═══════════════════════════════════════════════════════════════ */

import { db, functions } from './firebase.js';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

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

// --- Event & Pageview Tracking ---
async function logAnalyticsEvent(eventName) {
  try {
    const visitorId = localStorage.getItem('lyrica_visitor_id');
    const todayStr = new Date().toISOString().split('T')[0];

    const eventDoc = {
      visitorId: visitorId || 'unknown',
      eventName: eventName,
      dateStr: todayStr,
      timestamp: serverTimestamp()
    };

    await addDoc(collection(db, 'visitor_events'), eventDoc);
  } catch (e) {
    console.warn("Analytics: Event log failed:", e);
  }
}

// --- Visitor Tracking ---
async function initVisitorTracking() {
  try {
    // Determine page view label dynamically
    let pageLabel = 'Page View: Home';
    if (window.location.pathname.includes('privacy')) pageLabel = 'Page View: Privacy Policy';
    else if (window.location.pathname.includes('terms')) pageLabel = 'Page View: Terms of Service';
    else if (window.location.pathname.includes('checkout-loading')) pageLabel = 'Page View: Checkout Redirect';

    // Avoid double logging in the same tab session for visitor_logs
    if (sessionStorage.getItem('lyrica_session_logged')) {
      // Still track the pageview event even if the visitor session is already logged
      logAnalyticsEvent(pageLabel);
      return;
    }

    // Resolve or generate unique visitor ID for retention calculations
    let visitorId = localStorage.getItem('lyrica_visitor_id');
    let firstVisitDate = localStorage.getItem('lyrica_visitor_created');
    const todayStr = new Date().toISOString().split('T')[0];

    if (!visitorId) {
      visitorId = 'v_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      firstVisitDate = todayStr;
      localStorage.setItem('lyrica_visitor_id', visitorId);
      localStorage.setItem('lyrica_visitor_created', firstVisitDate);
    }

    // Determine device type
    let device = 'Desktop';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      if (/iPad|Tablet/i.test(navigator.userAgent)) {
        device = 'Tablet';
      } else {
        device = 'Mobile';
      }
    }

    // Attempt to get country from timezone or geolocation API
    let country = 'United States'; // Default fallback
    try {
      // Timezone fallback guess
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (tz) {
        if (tz.includes("Europe/London") || tz.includes("GB")) country = "United Kingdom";
        else if (tz.includes("Europe/Paris") || tz.includes("Europe/Berlin") || tz.includes("Europe/Rome") || tz.includes("Europe/Madrid")) country = "Germany";
        else if (tz.includes("Australia") || tz.includes("Sydney")) country = "Australia";
        else if (tz.includes("Asia/Tokyo")) country = "Japan";
        else if (tz.includes("America/New_York") || tz.includes("America/Chicago") || tz.includes("America/Los_Angeles")) country = "United States";
        else if (tz.includes("America/Toronto")) country = "Canada";
      }

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.country_name) {
          country = data.country_name;
        }
      }
    } catch (e) {
      console.warn("Analytics: Country resolve failed or timed out, using fallback", e);
    }

    // Log tracking data
    const logData = {
      visitorId,
      firstVisitDate,
      dateStr: todayStr,
      timestamp: serverTimestamp(),
      device,
      country,
      referrer: document.referrer ? new URL(document.referrer).hostname : 'Direct',
      path: window.location.pathname || '/'
    };

    await addDoc(collection(db, 'visitor_logs'), logData);
    sessionStorage.setItem('lyrica_session_logged', 'true');
    
    // Log the page view event
    logAnalyticsEvent(pageLabel);
  } catch (error) {
    console.error("Analytics: Tracking error:", error);
  }
}

const initAll = () => {
  initVisitorTracking();
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
  initFloatingBadges();
  
  if (window.createLemonSqueezy) {
    window.createLemonSqueezy();
  }
};

window.addEventListener('lemon_squeezy_loaded', () => {
  if (window.createLemonSqueezy) {
    window.createLemonSqueezy();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}


/* ── Promo Banner — Close on click, hide on scroll ─────────── */
function initPromoBanner() {
  const banner = document.getElementById('promo-banner');
  const closeBtn = document.getElementById('promo-close');
  const bannerText = banner ? banner.querySelector('.container p') : null;

  if (!banner || !closeBtn || !bannerText) return;

  let isBannerActive = false;
  const scrollThreshold = 80;

  // Listen to Firestore config in real-time
  onSnapshot(doc(db, 'settings', 'promo_banner'), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      isBannerActive = !!data.isActive;
      bannerText.innerHTML = data.html || '';
    } else {
      // No promo configured — keep banner hidden
      isBannerActive = false;
    }

    updateVisibility();
  });

  function updateVisibility() {
    if (!isBannerActive || banner.classList.contains('is-closed')) {
      banner.classList.add('is-hidden');
      banner.style.display = 'none';
    } else {
      banner.style.display = '';
      banner.classList.remove('is-hidden');
    }
  }

  // Mark as permanently closed when X is clicked
  closeBtn.addEventListener('click', () => {
    banner.classList.add('is-hidden');
    banner.classList.add('is-closed');
    banner.style.display = 'none';
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
      if (targetId === '#') {
        e.preventDefault();
        return;
      }

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

  // Intercept logo clicks to scroll to top smoothly without adding # to URL
  document.querySelectorAll('.header__logo, .footer__logo').forEach(logoLink => {
    logoLink.addEventListener('click', function (e) {
      const isHomepage = window.location.pathname === '/' || 
                         window.location.pathname === '' || 
                         window.location.pathname.endsWith('/index.html') ||
                         window.location.pathname.endsWith('/');
      
      if (isHomepage) {
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
        if (window.location.hash) {
          history.pushState("", document.title, window.location.pathname + window.location.search);
        }
      }
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

  const totalSteps = 4;
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
      goToStep(3, 'backward');
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

        // Check if group is recipient to toggle the "Other" textfield
        if (group.dataset.group === 'recipient') {
          const otherWrapper = document.getElementById('recipient-other-wrapper');
          if (otherWrapper) {
            if (chip.dataset.value === 'Other') {
              otherWrapper.classList.remove('is-hidden');
              otherWrapper.classList.add('is-visible');
              const input = document.getElementById('recipient-other');
              if (input) input.focus();
            } else {
              otherWrapper.classList.remove('is-visible');
              otherWrapper.classList.add('is-hidden');
              const input = document.getElementById('recipient-other');
              if (input) input.value = '';
            }
          }
        }

        // Check if group is occasion to toggle the "Other" textfield
        if (group.dataset.group === 'occasion') {
          const occasionOtherWrapper = document.getElementById('occasion-other-wrapper');
          if (occasionOtherWrapper) {
            if (chip.dataset.value === 'Other') {
              occasionOtherWrapper.classList.remove('is-hidden');
              occasionOtherWrapper.classList.add('is-visible');
              const input = document.getElementById('occasion-other');
              if (input) input.focus();
            } else {
              occasionOtherWrapper.classList.remove('is-visible');
              occasionOtherWrapper.classList.add('is-hidden');
              const input = document.getElementById('occasion-other');
              if (input) input.value = '';
            }
          }
        }
      });
    });
  });

  // ── Delivery Speed Selection (handled on Lemon Squeezy checkout page) ──
  const checkoutBtnText = checkoutSubmitBtn ? checkoutSubmitBtn.querySelector('span') : null;

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
    logAnalyticsEvent('Modal: Song Builder Open');
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

    const stepLabels = {
      1: 'Step 1: Recipient Details',
      2: 'Step 2: Genre & Mood',
      3: 'Step 3: Choose Plan',
      4: 'Step 4: Checkout Summary'
    };
    if (stepLabels[step]) {
      logAnalyticsEvent(stepLabels[step]);
    }

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

    // Show/hide standard footer and terms on step 4
    const footer = modal.querySelector('.song-modal__footer');
    const terms = modal.querySelector('.song-modal__terms');
    if (step === 4) {
      if (footer) footer.style.display = 'none';
      if (terms) terms.style.display = 'none';
    } else {
      if (footer) footer.style.display = 'flex';
      if (terms) terms.style.display = 'block';

      // Show/hide back button
      backBtn.classList.toggle('is-hidden', step === 1);

      // Update next button text on Step 3
      const nextText = nextBtn.querySelector('span');
      if (step === 3) {
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
      const selectedRecipient = modal.querySelector('[data-group="recipient"] .song-modal__chip.is-selected');
      if (!selectedRecipient) {
        shakeElement(modal.querySelector('[data-group="recipient"]'));
        return false;
      }
      if (selectedRecipient.dataset.value === 'Other') {
        const otherInput = document.getElementById('recipient-other');
        if (!otherInput || !otherInput.value.trim()) {
          shakeElement(otherInput);
          return false;
        }
      }

      const selectedOccasion = modal.querySelector('[data-group="occasion"] .song-modal__chip.is-selected');
      if (!selectedOccasion) {
        shakeElement(modal.querySelector('[data-group="occasion"]'));
        return false;
      }
      if (selectedOccasion.dataset.value === 'Other') {
        const otherInput = document.getElementById('occasion-other');
        if (!otherInput || !otherInput.value.trim()) {
          shakeElement(otherInput);
          return false;
        }
      }
    }
    if (step === 2) {
      const genreSelected = modal.querySelector('[data-group="genre"] .song-modal__chip.is-selected');
      const voiceSelected = modal.querySelector('[data-group="voice"] .song-modal__chip.is-selected');

      let isValid = true;
      if (!genreSelected) {
        shakeElement(modal.querySelector('[data-group="genre"]'));
        isValid = false;
      }
      if (!voiceSelected) {
        shakeElement(modal.querySelector('[data-group="voice"]'));
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
    const voiceChip = modal.querySelector('[data-group="voice"] .song-modal__chip.is-selected');

    let recipientVal = recipientChip ? recipientChip.dataset.value : '';
    if (recipientVal === 'Other') {
      const otherInput = document.getElementById('recipient-other');
      if (otherInput && otherInput.value.trim()) {
        recipientVal = otherInput.value.trim();
      }
    }

    let occasionVal = occasionChip ? occasionChip.dataset.value : '';
    if (occasionVal === 'Other') {
      const otherInput = document.getElementById('occasion-other');
      if (otherInput && otherInput.value.trim()) {
        occasionVal = otherInput.value.trim();
      }
    }

    const emailInput = document.getElementById('delivery-email');
    const emailVal = emailInput ? emailInput.value.trim() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal || !emailRegex.test(emailVal)) {
      shakeElement(emailInput);
      return;
    }


    const formData = {
      recipient: recipientVal,
      name: (document.getElementById('recipient-name') || {}).value || '',
      pronouns: pronounsChip ? pronounsChip.dataset.value : '',
      occasion: occasionVal,
      occasionStory: (document.getElementById('occasion-story') || {}).value || '',
      genre: genreChip ? genreChip.dataset.value : '',
      preferredVoice: voiceChip ? voiceChip.dataset.value : '',
      email: emailVal,
      memories: (document.getElementById('memories-jokes') || {}).value || '',
      words: [
        (document.getElementById('word-1') || {}).value || '',
        (document.getElementById('word-2') || {}).value || '',
        (document.getElementById('word-3') || {}).value || '',
      ].filter(Boolean),
      plan: 'standard',
      deliveryType: 'standard',
      price: '$79.00',
      promoCodeUsed: '',
      discountApplied: '',
      originalPrice: '$79.00',
      finalPrice: '$79.00'
    };

    console.log('Song Creation Checkout Form Submitted:', formData);
    logAnalyticsEvent('Action: Checkout Form Submitted');

    // Show the checkout redirect overlay on Phase 4
    const redirectOverlay = document.getElementById('checkout-redirect-overlay');
    if (redirectOverlay) {
      redirectOverlay.classList.add('is-visible');
    }

    // Also disable the checkout button
    const checkoutSubmitBtn = document.getElementById('checkout-submit-btn');
    const originalBtnHTML = checkoutSubmitBtn ? checkoutSubmitBtn.innerHTML : '';
    if (checkoutSubmitBtn) {
      checkoutSubmitBtn.disabled = true;
    }

    try {
      const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
      const { data } = await createCheckoutSession({
        email: emailVal,
        formData: formData
      });

      if (data && data.checkoutUrl) {
        // Redirect the current window to the Lemon Squeezy checkout
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('Failed to retrieve checkout URL.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      // Hide overlay on error
      if (redirectOverlay) {
        redirectOverlay.classList.remove('is-visible');
      }
      alert(err.message || 'An error occurred while setting up checkout. Please try again.');
    } finally {
      if (checkoutSubmitBtn) {
        checkoutSubmitBtn.disabled = false;
        checkoutSubmitBtn.innerHTML = originalBtnHTML;
      }
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

    // Hide other recipient wrapper
    const otherWrapper = document.getElementById('recipient-other-wrapper');
    if (otherWrapper) {
      otherWrapper.classList.remove('is-visible');
      otherWrapper.classList.add('is-hidden');
    }

    // Hide other occasion wrapper
    const occasionOtherWrapper = document.getElementById('occasion-other-wrapper');
    if (occasionOtherWrapper) {
      occasionOtherWrapper.classList.remove('is-visible');
      occasionOtherWrapper.classList.add('is-hidden');
    }
  }
}


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

      // Simple mock state for offline mode demonstration
      // Set to true to see offline mode, false for normal mode
      const isSupportOffline = true; 

      const onlineView = document.getElementById('support-online-view');
      const offlineView = document.getElementById('support-offline-view');
      const statusText = document.getElementById('support-status-text');
      const statusDot = document.getElementById('support-status-dot');

      if (isSupportOffline) {
        if (statusText) statusText.textContent = "We're currently away - auto answers available";
        if (statusDot) {
          statusDot.classList.remove('support-status-dot--online');
          statusDot.classList.add('support-status-dot--offline');
        }
      } else {
        if (statusText) statusText.textContent = 'We typically reply in a few minutes';
        if (statusDot) {
          statusDot.classList.add('support-status-dot--online');
          statusDot.classList.remove('support-status-dot--offline');
        }
      }
      
      // Always show the chat interface so automated FAQ replies work
      if (onlineView) onlineView.style.display = 'flex';
      if (offlineView) offlineView.style.display = 'none';
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

  // Offline Form Logic
  const offlineForm = document.getElementById('support-offline-form');
  const offlineSubmitBtn = document.getElementById('offline-submit-btn');
  const offlineSuccessMsg = document.getElementById('offline-success-msg');

  if (offlineForm) {
    offlineForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('offline-name').value.trim();
      const email = document.getElementById('offline-email').value.trim();
      const message = document.getElementById('offline-message').value.trim();

      if (!name || !email || !message) return;

      if (offlineSubmitBtn) {
        offlineSubmitBtn.disabled = true;
        offlineSubmitBtn.textContent = 'Sending...';
      }

      try {
        await addDoc(collection(db, 'support_offline_messages'), {
          name,
          email,
          message,
          timestamp: serverTimestamp(),
          status: 'new'
        });

        if (offlineSuccessMsg) offlineSuccessMsg.style.display = 'block';
        offlineForm.reset();
        
        setTimeout(() => {
          if (offlineSuccessMsg) offlineSuccessMsg.style.display = 'none';
          if (offlineSubmitBtn) {
            offlineSubmitBtn.disabled = false;
            offlineSubmitBtn.textContent = 'Send Message';
          }
          toggleWidget(); // Close widget after sending
        }, 3000);

      } catch (err) {
        console.error("Error sending offline message:", err);
        if (offlineSubmitBtn) {
          offlineSubmitBtn.disabled = false;
          offlineSubmitBtn.textContent = 'Send Message';
        }
        alert('There was an error sending your message. Please try again.');
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupportWidget);
} else {
  initSupportWidget();
}

/* ── Hero Title Typewriter ────────────────────────────── */
function initHeroTypewriter() {
  const typewriterSpan = document.querySelector('.hero__title .typewriter-text');
  if (!typewriterSpan) return;

  function createSplashNote() {
    if (!typewriterSpan) return;
    const note = document.createElement('span');
    const notes = ['♪', '♫', '♬', '♩'];
    note.textContent = notes[Math.floor(Math.random() * notes.length)];
    note.classList.add('splash-note', 'text-gradient');
    const rect = typewriterSpan.getBoundingClientRect();
    const startX = rect.left + window.scrollX + (Math.random() * rect.width);

    // Start notes at the vertical center of the text so they look closer to the baseline
    const centerY = rect.top + window.scrollY + rect.height / 2;
    const startY = centerY + (Math.random() * 10 - 5);

    note.style.left = `${startX}px`;
    note.style.top = `${startY}px`;

    // Drift slowly upwards
    const tx = (Math.random() * 30 - 15) + 'px'; // small horizontal drift
    const ty = -(Math.random() * 60 + 50) + 'px';  // drift upwards
    const rot = (Math.random() * 90 - 45) + 'deg'; // gentle rotation

    note.style.setProperty('--tx', tx);
    note.style.setProperty('--ty', ty);
    note.style.setProperty('--rot', rot);

    document.body.appendChild(note);

    setTimeout(() => {
      if (note.parentNode) {
        note.remove();
      }
    }, 2500);
  }

  // Continuous floating notes generator
  setInterval(createSplashNote, 500);
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

/* ── Floating Badges Content Rotation ───────────────────────── */
function initFloatingBadges() {
  const badge1 = document.querySelector('.floating-card-wrapper--1 .floating-card');
  const badge2 = document.querySelector('.floating-card-wrapper--2 .floating-card');
  
  if (!badge1 || !badge2) return;

  const badge1Data = [
    { icon: '🎵', title: 'New Song Ready!', desc: '"Forever Yours"' },
    { icon: '🎤', title: 'Vocals Recorded!', desc: '"Mama\'s Boy (Country)"' },
    { icon: '🎸', title: 'Acoustic Layer Added', desc: '"Sarah\'s Birthday"' },
    { icon: '✨', title: 'Mastering Done!', desc: '"Tears of Joy (Pop)"' }
  ];

  const badge2Data = [
    { icon: '⭐', title: '5-Star Review', desc: '"Made her cry happy tears!"' },
    { icon: '💖', title: '5-Star Review', desc: '"Best anniversary gift ever!"' },
    { icon: '😭', title: '5-Star Review', desc: '"Not a dry eye in the room."' },
    { icon: '💍', title: '5-Star Review', desc: '"He proposed and I said YES!"' }
  ];

  function rotateBadgeContent(badgeEl, dataList) {
    let index = 0;
    
    setInterval(() => {
      badgeEl.classList.add('is-fading');
      
      setTimeout(() => {
        index = (index + 1) % dataList.length;
        const currentData = dataList[index];
        
        const iconEl = badgeEl.querySelector('.floating-card__icon');
        const titleEl = badgeEl.querySelector('strong');
        const descEl = badgeEl.querySelector('small');
        
        if (iconEl) iconEl.textContent = currentData.icon;
        if (titleEl) titleEl.textContent = currentData.title;
        if (descEl) descEl.textContent = currentData.desc;
        
        badgeEl.classList.remove('is-fading');
      }, 400); // Wait for transition duration (400ms)
      
    }, 5000); // Rotate every 5 seconds
  }

  // Staggered starts: start badge1 immediately, start badge2 with a 2.5 second delay
  rotateBadgeContent(badge1, badge1Data);
  
  setTimeout(() => {
    rotateBadgeContent(badge2, badge2Data);
  }, 2500);
}

// Hide checkout loading overlay and enable button when navigated back to
window.addEventListener('pageshow', (event) => {
  const redirectOverlay = document.getElementById('checkout-redirect-overlay');
  if (redirectOverlay) {
    redirectOverlay.classList.remove('is-visible');
  }
  const checkoutSubmitBtn = document.getElementById('checkout-submit-btn');
  if (checkoutSubmitBtn) {
    checkoutSubmitBtn.disabled = false;
  }
});

/* ═══════════════════════════════════════════════════════════════
   FLASH SALE COUNTDOWN TIMER
   ═══════════════════════════════════════════════════════════════ */
(function initFlashSaleTimer() {
  const STORAGE_KEY = 'lyrica_flash_sale_end';
  const SALE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  const daysEl = document.getElementById('flash-days');
  const hoursEl = document.getElementById('flash-hours');
  const minsEl = document.getElementById('flash-mins');
  const secsEl = document.getElementById('flash-secs');
  const bannerEl = document.getElementById('flash-sale-banner');

  if (!daysEl || !hoursEl || !minsEl || !secsEl || !bannerEl) return;

  // Get or create the sale end timestamp
  let endTime = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (!endTime || isNaN(endTime) || endTime <= Date.now()) {
    endTime = Date.now() + SALE_DURATION_MS;
    localStorage.setItem(STORAGE_KEY, endTime.toString());
  }

  let prevSecs = -1;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function updateTimer() {
    const now = Date.now();
    const diff = endTime - now;

    if (diff <= 0) {
      // Sale has ended
      daysEl.textContent = '00';
      hoursEl.textContent = '00';
      minsEl.textContent = '00';
      secsEl.textContent = '00';
      bannerEl.style.display = 'none';
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    daysEl.textContent = pad(days);
    hoursEl.textContent = pad(hours);
    minsEl.textContent = pad(mins);
    secsEl.textContent = pad(secs);

    // Tick animation on seconds change
    if (secs !== prevSecs) {
      prevSecs = secs;
      secsEl.classList.add('tick');
      setTimeout(() => secsEl.classList.remove('tick'), 200);
    }

    requestAnimationFrame(updateTimer);
  }

  // Start the timer
  requestAnimationFrame(updateTimer);
})();

// --- Sticky Left-Side Flash Sale Banner Logic ---
(function initStickyFlashSale() {
  const widget = document.getElementById('flash-sticky');
  const tab = document.getElementById('flash-sticky-tab');
  const mobileBtn = document.getElementById('flash-sticky-mobile-btn');
  const panel = document.getElementById('flash-sticky-panel');
  const closeBtn = document.getElementById('flash-sticky-close');
  const ctaBtn = document.getElementById('flash-sticky-cta');

  // Desktop tab timer fields
  const tabDaysEl = document.getElementById('fst-days');
  const tabHoursEl = document.getElementById('fst-hours');

  // Expanded panel timer fields
  const panDaysEl = document.getElementById('fst2-days');
  const panHoursEl = document.getElementById('fst2-hours');
  const panMinsEl = document.getElementById('fst2-mins');
  const panSecsEl = document.getElementById('fst2-secs');

  if (!widget || !panel) return;

  function openPanel() {
    widget.classList.add('is-open');
    if (tab) tab.setAttribute('aria-expanded', 'true');
    if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
  }

  function closePanel() {
    widget.classList.remove('is-open');
    if (tab) tab.setAttribute('aria-expanded', 'false');
    if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
  }

  // Event Listeners
  if (tab) {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      widget.classList.contains('is-open') ? closePanel() : openPanel();
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        widget.classList.contains('is-open') ? closePanel() : openPanel();
      }
    });
  }

  if (mobileBtn) {
    mobileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      widget.classList.contains('is-open') ? closePanel() : openPanel();
    });
    mobileBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        widget.classList.contains('is-open') ? closePanel() : openPanel();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePanel();
    });
  }

  if (ctaBtn) {
    ctaBtn.addEventListener('click', () => {
      closePanel();
    });
  }

  // Close panel when clicking outside the widget
  document.addEventListener('click', (e) => {
    if (widget.classList.contains('is-open') && !widget.contains(e.target)) {
      closePanel();
    }
  });

  // Share the same timer / end time as the inline banner
  const STORAGE_KEY = 'lyrica_flash_sale_end';
  const SALE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  let endTime = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (!endTime || isNaN(endTime) || endTime <= Date.now()) {
    endTime = Date.now() + SALE_DURATION_MS;
    localStorage.setItem(STORAGE_KEY, endTime.toString());
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function updateStickyTimer() {
    const now = Date.now();
    const diff = endTime - now;

    if (diff <= 0) {
      // Sale ended
      if (tabDaysEl) tabDaysEl.textContent = '00';
      if (tabHoursEl) tabHoursEl.textContent = '00';
      if (panDaysEl) panDaysEl.textContent = '00';
      if (panHoursEl) panHoursEl.textContent = '00';
      if (panMinsEl) panMinsEl.textContent = '00';
      if (panSecsEl) panSecsEl.textContent = '00';
      widget.style.display = 'none';
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    // Update Desktop Tab (DD:HH format)
    if (tabDaysEl) tabDaysEl.textContent = pad(days);
    if (tabHoursEl) tabHoursEl.textContent = pad(hours);

    // Update Panel (DD:HH:MM:SS format)
    if (panDaysEl) panDaysEl.textContent = pad(days);
    if (panHoursEl) panHoursEl.textContent = pad(hours);
    if (panMinsEl) panMinsEl.textContent = pad(mins);
    if (panSecsEl) panSecsEl.textContent = pad(secs);

    requestAnimationFrame(updateStickyTimer);
  }

  // Start the sticky timer loop
  requestAnimationFrame(updateStickyTimer);
})();

