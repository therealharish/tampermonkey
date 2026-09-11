// ==UserScript==
// @name         FF Target Safety Companion
// @namespace    harishh.torn.userscripts
// @version      1.2.0
// @description  Opens FF Scouter targets below a chosen stat limit and double-confirms risky attack links in Tampermonkey and TornPDA.
// @author       Harish
// @license      GPLv3
// @copyright    2026, Harish
// @match        https://www.torn.com/*
// @grant        GM_openInTab
// @grant        GM_addStyle
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/therealharish/tampermonkey/main/FFScouter%20Based/FF%20Target%20Safety%20Companion.js
// @updateURL    https://raw.githubusercontent.com/therealharish/tampermonkey/main/FFScouter%20Based/FF%20Target%20Safety%20Companion.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const SCRIPT_ID = 'ff-target-safety';
  const STORAGE_KEYS = {
    limit: `${SCRIPT_ID}:limit`,
    cachedEstimates: `${SCRIPT_ID}:cached-estimates`,
    panelPosition: `${SCRIPT_ID}:panel-position`,
    panelMinimized: `${SCRIPT_ID}:panel-minimized`,
  };
  const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

  let targetCursor = 0;
  let renderQueued = false;
  let stylesInjected = false;

  function isEliminationPage() {
    const url = new URL(window.location.href);
    return url.pathname === '/page.php' && url.searchParams.get('sid') === 'elimination';
  }

  function isTornPDA() {
    return typeof window.PDA_httpGet === 'function'
      || typeof window.flutter_inappwebview?.callHandler === 'function';
  }

  function addStyle(css) {
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function openProfileInNewTab(url) {
    if (typeof GM_openInTab === 'function') {
      GM_openInTab(url, {
        active: false,
        insert: true,
        setParent: true,
      });
      return { opened: true, background: true };
    }

    // TornPDA does not expose GM_openInTab. Its WebView intercepts _blank and
    // creates a PDA browser tab; current TornPDA versions activate that tab.
    const openedWindow = window.open(url, '_blank', 'noopener');
    if (openedWindow) {
      try {
        openedWindow.opener = null;
        openedWindow.blur();
        window.focus();
      } catch {
        // The platform may isolate the newly created tab.
      }
    }

    return { opened: true, background: !isTornPDA() };
  }

  /**
   * Convert values such as 950m, 5.92b, 2.1t, and 1,250,000 into a number.
   * The result is the raw stat value, not a value in billions.
   */
  function parseStatValue(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value >= 0 ? value : null;
    }

    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase().replace(/,/g, '');
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([kmbtq]?)$/i);
    if (!match) return null;

    const amount = Number(match[1]);
    const multipliers = {
      '': 1,
      k: 1e3,
      m: 1e6,
      b: 1e9,
      t: 1e12,
      q: 1e15,
    };
    const parsed = amount * multipliers[match[2]];
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatStatValue(value) {
    if (!Number.isFinite(value)) return 'unknown';

    const units = [
      ['q', 1e15],
      ['t', 1e12],
      ['b', 1e9],
      ['m', 1e6],
      ['k', 1e3],
    ];

    for (const [suffix, multiplier] of units) {
      if (value >= multiplier) {
        return `${Number((value / multiplier).toPrecision(3))}${suffix}`;
      }
    }

    return String(Math.round(value));
  }

  function getConfiguredLimit() {
    return parseStatValue(localStorage.getItem(STORAGE_KEYS.limit) || '');
  }

  function readStoredJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function extractPlayerId(urlLike) {
    try {
      const url = new URL(urlLike, window.location.href);
      const value = url.searchParams.get('XID') || url.searchParams.get('user2ID');
      return value && /^\d+$/.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }

  function readEstimateCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.cachedEstimates) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeEstimateCache(cache) {
    try {
      localStorage.setItem(STORAGE_KEYS.cachedEstimates, JSON.stringify(cache));
    } catch {
      // The live page still works even if browser storage is unavailable.
    }
  }

  function rememberEstimate(playerId, estimate) {
    if (!playerId || !Number.isFinite(estimate)) return;
    const cache = readEstimateCache();
    cache[playerId] = { estimate, savedAt: Date.now() };

    for (const [id, entry] of Object.entries(cache)) {
      if (!entry || Date.now() - Number(entry.savedAt || 0) > CACHE_MAX_AGE_MS) {
        delete cache[id];
      }
    }

    writeEstimateCache(cache);
  }

  function getCachedEstimate(playerId) {
    if (!playerId) return null;
    const entry = readEstimateCache()[playerId];
    if (!entry || Date.now() - Number(entry.savedAt || 0) > CACHE_MAX_AGE_MS) return null;
    return Number.isFinite(entry.estimate) ? entry.estimate : null;
  }

  function findProfileLinkForBubble(bubble) {
    const ancestorLink = bubble.closest('a[href*="profiles.php"]');
    if (ancestorLink instanceof HTMLAnchorElement) return ancestorLink;

    const gauge = bubble.closest('.ffscouter-gauge');
    const nearbyLink = gauge?.closest('a[href*="profiles.php"]')
      || gauge?.parentElement?.querySelector('a[href*="profiles.php"]');
    return nearbyLink instanceof HTMLAnchorElement ? nearbyLink : null;
  }

  function collectVisibleTargets() {
    const seen = new Set();
    const targets = [];

    for (const bubble of document.querySelectorAll('.ffscouter-bubble')) {
      if (!isVisible(bubble)) continue;

      const estimateText = bubble.textContent?.trim() || '';
      const estimate = parseStatValue(estimateText);
      if (estimate === null) continue;

      const profileLink = findProfileLinkForBubble(bubble);
      if (!profileLink || !isVisible(profileLink)) continue;

      const playerId = extractPlayerId(profileLink.href);
      if (!playerId || seen.has(playerId)) continue;

      seen.add(playerId);
      rememberEstimate(playerId, estimate);
      targets.push({
        playerId,
        estimate,
        estimateText,
        profileUrl: new URL(profileLink.href, window.location.href).href,
        name: profileLink.getAttribute('aria-label')
          || profileLink.querySelector('img')?.getAttribute('alt')
          || `Player ${playerId}`,
      });
    }

    return targets;
  }

  function extractEstimateFromInfoLine() {
    for (const line of document.querySelectorAll('.ffscouter-info-line')) {
      const text = line.textContent || '';
      const match = text.match(/Est\.?\s*Stats\s*:\s*(\d+(?:\.\d+)?\s*[kmbtq]?)/i);
      if (match) {
        const estimate = parseStatValue(match[1]);
        if (estimate !== null) return estimate;
      }
    }
    return null;
  }

  function getEstimateForPlayer(playerId) {
    const onPageEstimate = extractEstimateFromInfoLine();
    if (onPageEstimate !== null) {
      rememberEstimate(playerId, onPageEstimate);
      return onPageEstimate;
    }
    return getCachedEstimate(playerId);
  }

  function getEligibleTargets() {
    const limit = getConfiguredLimit();
    if (limit === null) return [];
    return collectVisibleTargets().filter((target) => target.estimate < limit);
  }

  function setStatus(message, tone = 'neutral') {
    const status = document.getElementById(`${SCRIPT_ID}-status`);
    if (!status) return;
    if (status.textContent !== message) status.textContent = message;
    if (status.dataset.tone !== tone) status.dataset.tone = tone;
  }

  function refreshPanelStatus() {
    const limit = getConfiguredLimit();
    const button = document.getElementById(`${SCRIPT_ID}-open`);
    if (!(button instanceof HTMLButtonElement)) return;

    if (limit === null) {
      button.disabled = true;
      setStatus('Enter a max value (example: 5b).', 'warning');
      return;
    }

    const allTargets = collectVisibleTargets();
    const eligible = allTargets.filter((target) => target.estimate < limit);
    button.disabled = eligible.length === 0;

    if (allTargets.length === 0) {
      setStatus('Waiting for FF Scouter BS bubbles…', 'warning');
    } else if (eligible.length === 0) {
      setStatus(`No visible targets below ${formatStatValue(limit)}.`, 'warning');
    } else {
      setStatus(`${eligible.length} visible target${eligible.length === 1 ? '' : 's'} below ${formatStatValue(limit)}.`, 'safe');
    }
  }

  function openNextEligibleProfile() {
    const eligible = getEligibleTargets();
    if (eligible.length === 0) {
      refreshPanelStatus();
      return;
    }

    if (targetCursor >= eligible.length) targetCursor = 0;
    const target = eligible[targetCursor];
    targetCursor = (targetCursor + 1) % eligible.length;

    // This runs only from the user's explicit button click.
    const result = openProfileInNewTab(target.profileUrl);
    const platformNote = result.background ? '' : ' TornPDA may switch to the new tab.';
    setStatus(`Opened ${target.name} (${target.estimateText}).${platformNote}`, 'safe');
  }

  function clampPanelPosition(panel, requestedPosition) {
    const margin = 5;
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const left = Math.min(maxLeft, Math.max(margin, Number(requestedPosition.left) || margin));
    const top = Math.min(maxTop, Math.max(margin, Number(requestedPosition.top) || margin));

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    return { left: Math.round(left), top: Math.round(top) };
  }

  function savePanelPosition(panel) {
    const rect = panel.getBoundingClientRect();
    const position = clampPanelPosition(panel, { left: rect.left, top: rect.top });
    localStorage.setItem(STORAGE_KEYS.panelPosition, JSON.stringify(position));
  }

  function restorePanelPosition(panel) {
    const saved = readStoredJson(STORAGE_KEYS.panelPosition, null);
    const fallback = {
      left: window.innerWidth - panel.offsetWidth - 8,
      top: window.innerHeight * 0.34,
    };
    clampPanelPosition(panel, saved && Number.isFinite(saved.left) && Number.isFinite(saved.top) ? saved : fallback);
  }

  function setPanelMinimized(panel, minimized, persist = true, preserveRightEdge = true) {
    const beforeResize = panel.getBoundingClientRect();
    panel.classList.toggle('ffts-minimized', minimized);
    const button = panel.querySelector(`#${SCRIPT_ID}-minimize`);
    if (button instanceof HTMLButtonElement) {
      button.textContent = minimized ? '+' : '−';
      button.setAttribute('aria-label', minimized ? 'Expand FF Safe Target' : 'Minimize FF Safe Target');
      button.title = minimized ? 'Expand' : 'Minimize';
    }
    if (persist) localStorage.setItem(STORAGE_KEYS.panelMinimized, String(minimized));

    if (preserveRightEdge) {
      window.requestAnimationFrame(() => {
        const resized = panel.getBoundingClientRect();
        const position = clampPanelPosition(panel, {
          left: beforeResize.right - resized.width,
          top: beforeResize.top,
        });
        localStorage.setItem(STORAGE_KEYS.panelPosition, JSON.stringify(position));
      });
    }
  }

  function makePanelDraggable(panel) {
    const handle = panel.querySelector('.ffts-header');
    if (!(handle instanceof HTMLElement)) return;

    let dragState = null;

    const finishDrag = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      dragState = null;
      handle.classList.remove('ffts-dragging');
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      savePanelPosition(panel);
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button, input, a, select, textarea')) return;
      const rect = panel.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('ffts-dragging');
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      clampPanelPosition(panel, {
        left: event.clientX - dragState.offsetX,
        top: event.clientY - dragState.offsetY,
      });
    });

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  }

  function injectPanelStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    addStyle(`
      #${SCRIPT_ID}-panel {
        --ffts-border: var(--panel-divider-outer-side-color, #4e8f35);
        --ffts-background: var(--default-bg-panel-color, rgba(31, 34, 38, 0.97));
        --ffts-color: var(--default-color, #f1f1f1);
        --ffts-input-background: var(--input-background-color, #fff);
        --ffts-input-color: var(--input-color, #111);
        position: fixed;
        z-index: 2147483000;
        width: 220px;
        box-sizing: border-box;
        padding: 8px 10px 10px;
        border: 1px solid var(--ffts-border);
        border-radius: 7px;
        background: var(--ffts-background);
        color: var(--ffts-color);
        box-shadow: 0 3px 14px rgba(0, 0, 0, 0.45);
        font: 12px/1.35 Arial, sans-serif;
      }
      #${SCRIPT_ID}-panel * { box-sizing: border-box; }
      #${SCRIPT_ID}-panel.ffts-minimized { width: 154px; padding-bottom: 8px; }
      #${SCRIPT_ID}-panel.ffts-minimized .ffts-body { display: none; }
      #${SCRIPT_ID}-panel .ffts-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }
      #${SCRIPT_ID}-panel .ffts-header.ffts-dragging { cursor: grabbing; }
      #${SCRIPT_ID}-panel .ffts-title { font-size: 14px; font-weight: 700; }
      #${SCRIPT_ID}-panel .ffts-minimize {
        width: 24px;
        height: 24px;
        flex: 0 0 24px;
        padding: 0;
        border: 1px solid var(--ffts-border);
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: 700 16px/20px Arial, sans-serif;
      }
      #${SCRIPT_ID}-panel .ffts-minimize:hover { background: var(--default-bg-panel-hover-color, rgba(127, 127, 127, 0.2)); }
      #${SCRIPT_ID}-panel .ffts-body { margin-top: 7px; }
      #${SCRIPT_ID}-panel .ffts-label { display: block; margin-bottom: 4px; opacity: 0.85; }
      #${SCRIPT_ID}-panel .ffts-row { display: grid; grid-template-columns: 62px 1fr; gap: 6px; }
      #${SCRIPT_ID}-panel input,
      #${SCRIPT_ID}-panel .ffts-open {
        min-height: 32px;
        border: 1px solid var(--default-panel-divider-outer-side-color, #666);
        border-radius: 4px;
        font: inherit;
      }
      #${SCRIPT_ID}-panel input {
        width: 100%;
        padding: 5px 6px;
        background: var(--ffts-input-background);
        color: var(--ffts-input-color);
      }
      #${SCRIPT_ID}-panel .ffts-open {
        padding: 5px 7px;
        background: var(--chat-color-success, #4e8f35);
        color: #fff;
        cursor: pointer;
        font-weight: 700;
      }
      #${SCRIPT_ID}-panel .ffts-open:hover:not(:disabled) { filter: brightness(1.12); }
      #${SCRIPT_ID}-panel .ffts-open:disabled { cursor: not-allowed; opacity: 0.5; }
      #${SCRIPT_ID}-panel .ffts-status { min-height: 31px; margin-top: 7px; }
      #${SCRIPT_ID}-panel .ffts-status[data-tone="safe"] { color: var(--chat-color-success, #8ee06f); }
      #${SCRIPT_ID}-panel .ffts-status[data-tone="warning"] { color: var(--chat-color-warning, #ffd166); }
      #${SCRIPT_ID}-panel .ffts-status[data-tone="danger"] { color: var(--chat-color-error, #ff7474); }
      #${SCRIPT_ID}-panel .ffts-note { opacity: 0.6; font-size: 10px; }
    `);
  }

  function createPanel() {
    if (!isEliminationPage() || !document.body || document.getElementById(`${SCRIPT_ID}-panel`)) return;

    injectPanelStyles();

    const panel = document.createElement('section');
    panel.id = `${SCRIPT_ID}-panel`;
    panel.setAttribute('aria-label', 'FF target safety controls');
    panel.innerHTML = `
      <div class="ffts-header">
        <div class="ffts-title">FF Safe Target</div>
        <button id="${SCRIPT_ID}-minimize" class="ffts-minimize" type="button" aria-label="Minimize FF Safe Target" title="Minimize">−</button>
      </div>
      <div class="ffts-body">
        <label class="ffts-label" for="${SCRIPT_ID}-limit">Max estimated stats</label>
        <div class="ffts-row">
          <input id="${SCRIPT_ID}-limit" type="text" inputmode="decimal" placeholder="e.g. 5b" autocomplete="off">
          <button id="${SCRIPT_ID}-open" class="ffts-open" type="button">Open next profile</button>
        </div>
        <div id="${SCRIPT_ID}-status" class="ffts-status" data-tone="neutral"></div>
        <div class="ffts-note">Uses visible FF Scouter BS bubbles. Opens profiles only.</div>
      </div>
    `;
    document.body.appendChild(panel);

    const startsMinimized = localStorage.getItem(STORAGE_KEYS.panelMinimized) === 'true';
    setPanelMinimized(panel, startsMinimized, false, false);
    restorePanelPosition(panel);
    makePanelDraggable(panel);

    const input = document.getElementById(`${SCRIPT_ID}-limit`);
    const openButton = document.getElementById(`${SCRIPT_ID}-open`);
    const minimizeButton = document.getElementById(`${SCRIPT_ID}-minimize`);
    if (input instanceof HTMLInputElement) {
      input.value = localStorage.getItem(STORAGE_KEYS.limit) || '';
      input.addEventListener('input', () => {
        localStorage.setItem(STORAGE_KEYS.limit, input.value.trim());
        targetCursor = 0;
        refreshPanelStatus();
      });
    }
    openButton?.addEventListener('click', openNextEligibleProfile);
    minimizeButton?.addEventListener('click', () => {
      setPanelMinimized(panel, !panel.classList.contains('ffts-minimized'));
    });

    refreshPanelStatus();
  }

  function syncPanelVisibility() {
    const panel = document.getElementById(`${SCRIPT_ID}-panel`);
    if (!isEliminationPage()) {
      panel?.remove();
      return;
    }

    createPanel();
    refreshPanelStatus();
  }

  function isAttackUrl(urlLike) {
    try {
      const url = new URL(urlLike, window.location.href);
      return url.hostname === 'www.torn.com'
        && url.pathname.endsWith('/page.php')
        && url.searchParams.get('sid') === 'attack'
        && /^\d+$/.test(url.searchParams.get('user2ID') || '');
    } catch {
      return false;
    }
  }

  function getAttackIntent(clickedElement) {
    const link = clickedElement.closest('a[href]');
    if (link instanceof HTMLAnchorElement && isAttackUrl(link.href)) {
      return {
        href: link.href,
        playerId: extractPlayerId(link.href),
        target: link.target || '_self',
      };
    }

    const profileAction = clickedElement.closest('[id^="button0-profile-"]');
    const looksLikeAttack = profileAction
      && /attack/i.test(`${profileAction.getAttribute('aria-label') || ''} ${profileAction.getAttribute('title') || ''}`);
    if (looksLikeAttack) {
      const playerId = extractPlayerId(window.location.href);
      if (playerId) {
        return {
          href: `https://www.torn.com/page.php?sid=attack&user2ID=${playerId}`,
          playerId,
          target: '_self',
        };
      }
    }

    return null;
  }

  function continueToAttackPage(intent) {
    if (intent.target === '_blank') {
      const opened = window.open(intent.href, '_blank');
      if (opened) opened.opener = null;
    } else {
      window.location.assign(intent.href);
    }
  }

  function guardAttackClick(event) {
    if (!(event.target instanceof Element) || event.button !== 0) return;

    const intent = getAttackIntent(event.target);
    if (!intent?.playerId) return;

    const limit = getConfiguredLimit();
    if (limit === null) return;

    const estimate = getEstimateForPlayer(intent.playerId);
    const isUnknown = estimate === null;
    const isOverLimit = estimate !== null && estimate > limit;
    if (!isUnknown && !isOverLimit) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const comparison = isUnknown
      ? `FF Scouter's estimated stats for player ${intent.playerId} could not be read.`
      : `Estimated stats ${formatStatValue(estimate)} are ABOVE your ${formatStatValue(limit)} limit.`;

    const firstConfirmed = window.confirm(
      `FF TARGET SAFETY — WARNING 1 OF 2\n\n${comparison}\n\nContinue to the attack page?`
    );
    if (!firstConfirmed) return;

    const secondConfirmed = window.confirm(
      `FF TARGET SAFETY — FINAL WARNING 2 OF 2\n\nTarget: ${intent.playerId}\nEstimate: ${formatStatValue(estimate)}\nYour limit: ${formatStatValue(limit)}\n\nOpen the attack page anyway?`
    );
    if (!secondConfirmed) return;

    // This only opens Torn's attack page; it never performs an attack.
    continueToAttackPage(intent);
  }

  function queueRefresh() {
    if (!isEliminationPage()) {
      document.getElementById(`${SCRIPT_ID}-panel`)?.remove();
      return;
    }
    if (renderQueued) return;
    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      syncPanelVisibility();
    });
  }

  // Capture early so risky Torn/FF Scouter handlers do not run before the guard.
  document.addEventListener('click', guardAttackClick, true);

  const start = () => {
    syncPanelVisibility();
    const observer = new MutationObserver(queueRefresh);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', queueRefresh);
    window.addEventListener('popstate', queueRefresh);
    window.navigation?.addEventListener('currententrychange', queueRefresh);
    window.addEventListener('resize', () => {
      const panel = document.getElementById(`${SCRIPT_ID}-panel`);
      if (panel instanceof HTMLElement) savePanelPosition(panel);
    });
    window.setInterval(syncPanelVisibility, 3000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
