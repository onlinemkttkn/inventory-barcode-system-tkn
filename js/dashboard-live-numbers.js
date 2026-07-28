(() => {
  'use strict';

  const activeAnimations = new WeakMap();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  const formatters = {
    number(value, options = {}) {
      return Number(value || 0).toLocaleString('th-TH', {
        minimumFractionDigits: options.minimumFractionDigits ?? 0,
        maximumFractionDigits: options.maximumFractionDigits ?? 0,
      });
    },
    decimal(value, options = {}) {
      return Number(value || 0).toLocaleString('th-TH', {
        minimumFractionDigits: options.minimumFractionDigits ?? 0,
        maximumFractionDigits: options.maximumFractionDigits ?? 3,
      });
    },
    money(value) {
      return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value || 0));
    },
  };

  function cancel(element) {
    const frame = activeAnimations.get(element);
    if (frame) cancelAnimationFrame(frame);
    activeAnimations.delete(element);
  }

  function set(element, targetValue, options = {}) {
    if (!element) return;

    const target = Number(targetValue || 0);
    const type = options.type || 'number';
    const formatter = formatters[type] || formatters.number;
    const previous = Number(element.dataset.liveNumberValue || 0);
    const duration = Math.max(0, Number(options.duration ?? 620));

    cancel(element);
    element.dataset.liveNumberValue = String(target);

    if (!Number.isFinite(target) || duration === 0 || reducedMotion?.matches) {
      element.textContent = formatter(target, options);
      return;
    }

    const delta = target - previous;
    if (Math.abs(delta) < 0.000001) {
      element.textContent = formatter(target, options);
      return;
    }

    const start = performance.now();
    element.classList.add('is-live-number-updating');

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = previous + delta * eased;
      element.textContent = formatter(current, options);

      if (progress < 1) {
        const frame = requestAnimationFrame(tick);
        activeAnimations.set(element, frame);
      } else {
        element.textContent = formatter(target, options);
        element.classList.remove('is-live-number-updating');
        activeAnimations.delete(element);
      }
    };

    const frame = requestAnimationFrame(tick);
    activeAnimations.set(element, frame);
  }

  window.TKNLiveNumber = Object.freeze({ set, cancel });
})();
