/* ============================================================
   PERFECT SMILE DENTAL — ALL-ON-4
   Interacciones de la página. Sin dependencias.
   Cada bloque es independiente: si su sección no existe en la
   página, simplemente no hace nada.
   ============================================================ */

/* ------------------------------------------------------------
   1. Aparición al hacer scroll (.psd-reveal)
   ------------------------------------------------------------ */
(function scrollReveal() {
  const els = document.querySelectorAll('.psd-reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('psd-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('psd-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  els.forEach((el) => io.observe(el));
})();

/* ------------------------------------------------------------
   2. Pestañas de "El sistema All-on-4"
   ------------------------------------------------------------ */
(function systemTabs() {
  const wrap = document.getElementById('psd-tabs');
  if (!wrap) return;

  const tabs = Array.from(wrap.querySelectorAll('.parts__tab'));
  const panels = document.querySelectorAll('.parts__panel');

  const select = (idx) => {
    tabs.forEach((t) => {
      const on = t.dataset.idx === String(idx);
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach((p) => p.classList.toggle('is-active', p.dataset.idx === String(idx)));
  };

  tabs.forEach((tab) => tab.addEventListener('click', () => select(Number(tab.dataset.idx))));

  // Flechas izquierda/derecha entre pestañas, como espera un lector de pantalla
  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const current = tabs.findIndex((t) => t.classList.contains('is-active'));
    const next = (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    select(next);
    tabs[next].focus();
  });
})();

/* ------------------------------------------------------------
   3. Comparador antes / después
   El control es un <input type="range"> invisible encima de la
   foto. Solo hay que pasar su valor a la variable CSS --pos.
   ------------------------------------------------------------ */
(function beforeAfter() {
  document.querySelectorAll('.ba').forEach((card) => {
    const range = card.querySelector('.ba__range');
    if (!range) return;
    const apply = () => card.style.setProperty('--pos', `${range.value}%`);
    range.addEventListener('input', apply);
    apply();
  });
})();

/* ------------------------------------------------------------
   4. Modal de video
   Cada .video-frame-inner lleva en data-* la fuente del video:
     data-video-src   URL del .mp4, o enlace de Vimeo / YouTube
     data-video-type  "mp4" | "vimeo" | "youtube"
     data-video-poster  imagen de vista previa (solo mp4)
   ------------------------------------------------------------ */
(function videoModal() {
  const modal = document.getElementById('psd-video-modal');
  const content = document.getElementById('psd-video-modal-content');
  if (!modal || !content) return;

  const emptyMsg = modal.dataset.emptyMsg || '';
  let lastTrigger = null;

  // Acepta el enlace tal como lo copias del navegador:
  //   https://vimeo.com/123456789            -> player.vimeo.com/video/123456789
  //   https://vimeo.com/123456789/abc123def  -> video no listado, con hash
  //   https://youtu.be/ID · youtube.com/watch?v=ID -> youtube-nocookie.com/embed/ID
  function toEmbed(src, type) {
    if (type === 'vimeo') {
      if (src.includes('player.vimeo.com')) return src;
      const m = src.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-z0-9]+))?/i);
      if (!m) return src;
      return `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ''}`;
    }
    if (type === 'youtube') {
      if (src.includes('/embed/')) return src;
      const m = src.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
      return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : src;
    }
    return src;
  }

  function openModal(frame) {
    const src = frame.dataset.videoSrc || '';
    const type = frame.dataset.videoType || 'mp4';
    const poster = frame.dataset.videoPoster || '';
    lastTrigger = frame;

    if (!src) {
      content.innerHTML = `<div class="video-modal__empty">${emptyMsg}</div>`;
    } else if (type === 'youtube' || type === 'vimeo') {
      const url = toEmbed(src, type);
      const sep = url.includes('?') ? '&' : '?';
      content.innerHTML =
        `<iframe src="${url}${sep}autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else {
      content.innerHTML =
        `<video src="${src}"${poster ? ` poster="${poster}"` : ''} controls autoplay playsinline></video>`;
    }

    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('is-open');
    content.innerHTML = '';
    document.body.style.overflow = '';
    if (lastTrigger) lastTrigger.focus();
  }

  // Delegación de eventos: funciona con cualquier número de videos
  document.addEventListener('click', (e) => {
    const frame = e.target.closest('.video-frame-inner');
    if (frame) { openModal(frame); return; }
    if (e.target.closest('[data-close]')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    const frame = e.target.closest && e.target.closest('.video-frame-inner');
    if (frame && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openModal(frame); }
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });
})();

/* ------------------------------------------------------------
   5. Videos en loop (vista previa automática)
   Se reproducen solos, sin sonido y en bucle. Al hacer clic se
   abre el modal con sonido y controles (bloque 4).
   - Se pausan cuando salen de pantalla, para no gastar batería.
   - Se pausan mientras el modal está abierto.
   - Si el usuario pidió "reducir movimiento" en su sistema,
     no se reproducen solos.
   ------------------------------------------------------------ */
(function loopVideos() {
  const videos = Array.from(document.querySelectorAll('.video-frame__loop'));
  if (!videos.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const modal = document.getElementById('psd-video-modal');
  const inView = new Map();

  const shouldPlay = (v) =>
    !reduceMotion && inView.get(v) && !(modal && modal.classList.contains('is-open'));

  const sync = (v) => {
    if (shouldPlay(v)) {
      v.play().catch(() => {}); // si el navegador bloquea el autoplay, se queda el poster
    } else {
      v.pause();
    }
  };

  videos.forEach((v) => {
    v.muted = true; // obligatorio para autoplay en iPhone y Chrome
    if (reduceMotion) v.removeAttribute('autoplay');
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          inView.set(e.target, e.isIntersecting);
          sync(e.target);
        });
      },
      { threshold: 0.25 }
    );
    videos.forEach((v) => io.observe(v));
  } else {
    videos.forEach((v) => { inView.set(v, true); sync(v); });
  }

  if (modal) {
    new MutationObserver(() => videos.forEach(sync)).observe(modal, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
})();

/* ------------------------------------------------------------
   6. Modales de formulario y calendario (GoHighLevel)
   - data-form-open      → abre el formulario de contacto
   - data-calendar-open  → abre el calendario de citas
   Se cierran con la X, clic afuera o Escape.
   El href de cada botón se queda como respaldo: si el JS falla,
   el enlace funciona igual que antes.
   El calendario se carga hasta que alguien lo abre (data-src),
   para no hacer más lenta la página.
   ------------------------------------------------------------ */
(function embedModals() {
  function setup(modalId, triggerAttr) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const closeBtn = modal.querySelector('.form-modal__close');
    let lastTrigger = null;

    function open(e) {
      e.preventDefault();
      lastTrigger = e.currentTarget;

      // Carga diferida: el iframe recibe su src la primera vez que se abre
      modal.querySelectorAll('iframe[data-src]').forEach((frame) => {
        if (!frame.getAttribute('src')) frame.setAttribute('src', frame.dataset.src);
      });

      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastTrigger) lastTrigger.focus();
    }

    document.querySelectorAll(`[${triggerAttr}]`).forEach((el) => el.addEventListener('click', open));

    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-form-close]')) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
    });
  }

  setup('psd-form-modal', 'data-form-open');
  setup('psd-calendar-modal', 'data-calendar-open');
})();