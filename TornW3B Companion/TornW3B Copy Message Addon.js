// ==UserScript==
// @name         TornW3B Copy Message Addon
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Adds a "Copy Message" button next to "View/Edit Receipt" on trade pages. Requires the official TornW3B Companion.
// @match        https://www.torn.com/trade.php*
// @updateURL    https://raw.githubusercontent.com/therealharish/tampermonkey/main/TornW3B%20Companion/TornW3B%20Copy%20Message%20Addon.js
// @downloadURL  https://raw.githubusercontent.com/therealharish/tampermonkey/main/TornW3B%20Companion/TornW3B%20Copy%20Message%20Addon.js
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BTN_CLASS = 'w3b-cm-btn';
    const SILENT_CLASS = 'w3b-cm-silent';
    const PASTE_SVG = '<svg class="button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

    GM_addStyle(`
        @media only screen and (min-width: 785px) {
            .stripe-container:has(.${BTN_CLASS}:not(.hidden)) { flex-wrap: nowrap; padding-left: 15px; padding-right: 15px; }
            .stripe-container:has(.${BTN_CLASS}:not(.hidden)) > *,
            .stripe-container:has(.${BTN_CLASS}:not(.hidden)) .value-container > * { min-width: 0 !important; padding-left: 12px !important; padding-right: 12px !important; }
            .stripe-container .value-container:has(.${BTN_CLASS}:not(.hidden)) { gap: 10px; }
        }
        html.${SILENT_CLASS} dialog.receipt-modal-overlay,
        html.${SILENT_CLASS} dialog.receipt-modal-overlay::backdrop { opacity: 0 !important; pointer-events: none !important; }
    `);

    const flash = (btn, text) => {
        const label = btn.querySelector('.button-text');
        label.textContent = text;
        setTimeout(() => { label.textContent = 'Copy Message'; }, 1200);
    };

    // Opens the Companion's receipt modal invisibly, clicks its own "Copy message" button, then closes it.
    // This reuses the Companion's stored message, so no internals or storage need to be duplicated here.
    function copyMessage(btn, receiptBtn) {
        document.documentElement.classList.add(SILENT_CLASS);
        try {
            receiptBtn.click();
            const overlay = document.querySelector('dialog.receipt-modal-overlay');
            const copyBtn = overlay && [...overlay.querySelectorAll('.receipt-toolbar button')]
                .find(b => /copy message/i.test(b.textContent));
            if (copyBtn) copyBtn.click();
            flash(btn, copyBtn ? 'Copied!' : 'No message');
            if (overlay?.open) overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        } finally {
            setTimeout(() => document.documentElement.classList.remove(SILENT_CLASS), 50);
        }
    }

    function sync() {
        document.querySelectorAll('.value-container').forEach(container => {
            const receiptBtn = container.querySelector(`.receipt-url-container:not(.${BTN_CLASS})`);
            if (!receiptBtn) return;
            let btn = container.querySelector(`.${BTN_CLASS}`);
            if (!btn) {
                btn = document.createElement('div');
                btn.className = `receipt-url-container ${BTN_CLASS}`;
                btn.innerHTML = `${PASTE_SVG}<span class="button-text">Copy Message</span>`;
                btn.addEventListener('click', () => copyMessage(btn, container.querySelector(`.receipt-url-container:not(.${BTN_CLASS})`)));
                receiptBtn.after(btn);
            }
            btn.classList.toggle('hidden', receiptBtn.classList.contains('hidden'));
        });
    }

    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; sync(); });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
})();
