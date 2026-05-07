// ==UserScript==
// @name         Torn Trade Enter Automation
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Step-by-step Enter key automation for Torn trades. Works alongside Weaver's Trading Companion.
// @match        https://www.torn.com/trade.php*
// @grant        none
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    let currentStep = 0;
    let isProcessing = false;
    let traderName = null; // The other person's username in the trade
    let currentTradeID = null;
    let copiedMessage = null; // Store message text directly from the modal

    const getTradeID = () => {
        const hash = location.hash.replace('#', '');
        return new URLSearchParams(hash).get('ID');
    };

    const resetSteps = () => {
        currentStep = 0;
        traderName = null;
        isProcessing = false;
        copiedMessage = null;
    };

    // Watch for trade changes (SPA navigation via hash)
    const checkTradeChange = () => {
        const newID = getTradeID();
        if (newID && newID !== currentTradeID) {
            currentTradeID = newID;
            resetSteps();
            if (typeof updateBadge === 'function') updateBadge();
        }
    };

    // Listen for hash changes
    window.addEventListener('hashchange', checkTradeChange);
    // Also poll, since some navigations don't trigger hashchange
    setInterval(checkTradeChange, 500);
    // Initialize
    currentTradeID = getTradeID();

    // Extract the trader's name from the trade page (the right-side user)
    const getTraderName = () => {
        // The right-side user header contains the other trader's name
        const rightUser = document.querySelector('.user.right .name') 
            || document.querySelector('.user.right a.user.name');
        if (rightUser) return rightUser.textContent.trim();
        // Fallback: look for the username link in the trade header area
        const headers = document.querySelectorAll('.trade-cont .user.name, .color2 .user.name');
        for (const h of headers) {
            const name = h.textContent.trim();
            if (name) return name;
        }
        return null;
    };

    // Find the chat input for the trader
    const findChatInput = () => {
        // Torn chat uses a textarea with placeholder "Type your message here..."
        const allInputs = document.querySelectorAll('textarea[placeholder*="Type your message"], textarea[class*="textarea___"]');
        if (allInputs.length === 0) return null;
        if (allInputs.length === 1) return allInputs[0];

        // Multiple chat windows open — find the one belonging to the trader
        if (traderName) {
            for (const input of allInputs) {
                // Walk up the DOM to find the chat panel container that has the trader's name
                let parent = input.parentElement;
                for (let i = 0; i < 15 && parent; i++) {
                    if (parent.textContent.includes(traderName)) {
                        // Make sure this is the right panel (the name should be in a header-like area, not deep content)
                        // Check if the trader name appears near the top of this container
                        const firstChild = parent.firstElementChild;
                        if (firstChild && firstChild.textContent.includes(traderName)) {
                            return input;
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }

        // Fallback: return the last input (most recently opened chat)
        return allInputs[allInputs.length - 1];
    };
    const STEP_NAMES = [
        'View/Edit Receipt',
        'Copy Message',
        'Open Chat',
        'Paste Message',
        'Send Message',
        'Close Chat',
        'Click Accept Button',
        'Go to Dashboard'
    ];

    // ── Helpers ──────────────────────────────────────────────────────────

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const waitFor = (selector, timeout = 3000) =>
        new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });

    const findButtonByText = (container, text) => {
        const buttons = container.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent.trim() === text) return btn;
        }
        return null;
    };

    // ── Status Badge ────────────────────────────────────────────────────

    const badge = document.createElement('div');
    Object.assign(badge.style, {
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        background: 'rgba(30,30,30,0.92)',
        color: '#4a9eff',
        padding: '6px 14px',
        borderRadius: '6px',
        fontSize: '12px',
        fontFamily: "'Segoe UI', Tahoma, sans-serif",
        fontWeight: '600',
        zIndex: '99999',
        border: '1px solid #444',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        transition: 'opacity 0.3s',
        pointerEvents: 'none',
        userSelect: 'none'
    });
    const updateBadge = () => {
        if (currentStep >= STEP_NAMES.length) {
            badge.textContent = '✓ Done';
            badge.style.color = '#10b981';
        } else {
            badge.textContent = `Enter → ${STEP_NAMES[currentStep]}`;
            badge.style.color = '#4a9eff';
        }
    };
    document.body.appendChild(badge);
    updateBadge();

    // ── Step Implementations ────────────────────────────────────────────

    async function stepViewReceipt() {
        const receiptBtn = document.querySelector('.receipt-url-container');
        if (!receiptBtn) throw new Error('Receipt button not found');
        receiptBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await sleep(300);
    }

    async function stepCopyMessage() {
        const modal = await waitFor('.receipt-modal-overlay.visible', 2000);
        if (!modal) throw new Error('Receipt modal not open');
        // Grab the raw message HTML from the modal (Torn chat renders <a> tags as links)
        const messageContent = modal.querySelector('.message-content');
        if (messageContent) {
            // Get innerHTML and convert <br> back to newlines, keep <a> tags as-is
            let msg = messageContent.innerHTML;
            msg = msg.replace(/<br\s*\/?>/gi, '\n');
            copiedMessage = msg.trim();
        }
        // Still click the Copy Message button (copies to clipboard too)
        const copyBtn = findButtonByText(modal, 'Copy Message');
        if (!copyBtn) throw new Error('Copy Message button not found');
        copyBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await sleep(200);
        if (!copiedMessage) throw new Error('Could not extract message text from modal');
    }

    async function stepOpenChat() {
        // Capture trader name before closing modal
        if (!traderName) traderName = getTraderName();

        // Close the modal first
        const closeBtn = document.querySelector('.receipt-modal-overlay.visible .close-modal');
        if (closeBtn) {
            closeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            await sleep(400);
        }
        // Click "Open Chat" — could be an <a>, <span>, <div>, or any element
        const allElements = document.querySelectorAll('a, span, div, button, p');
        let openChatEl = null;
        for (const el of allElements) {
            if (el.children.length === 0 && el.textContent.trim() === 'Open Chat') {
                openChatEl = el;
                break;
            }
        }
        // Fallback: check elements that *contain* the text (for nested structures)
        if (!openChatEl) {
            for (const el of allElements) {
                if (el.textContent.trim() === 'Open Chat') {
                    openChatEl = el;
                    break;
                }
            }
        }
        if (openChatEl) {
            openChatEl.click();
            await sleep(500); // Give chat panel time to open
        } else {
            throw new Error('Open Chat link not found');
        }
    }

    async function stepPasteMessage() {
        if (!copiedMessage) throw new Error('No message stored — run Copy Message step first');
        // Find the chat input for the specific trader
        const input = findChatInput();
        if (!input) throw new Error('Chat input not found — make sure the chat window is open');

        input.focus();
        try {
            // Use the correct prototype setter based on element type
            const proto = input instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (nativeSetter) {
                nativeSetter.call(input, copiedMessage);
            } else {
                input.value = copiedMessage;
            }
        } catch (e) {
            // Direct assignment fallback
            input.value = copiedMessage;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(100);
    }

    async function stepSendMessage() {
        // This step is handled specially in the keydown listener:
        // The Enter key goes through to the chat naturally to send.
        // This function just blurs the input afterward.
        const chatInput = findChatInput();
        if (chatInput) {
            await sleep(200);
            chatInput.blur();
            document.body.focus();
        }
    }

    async function stepCloseChat() {
        // Close the chat window by clicking the X button in the header
        // Header buttons have class containing "header___"
        // There are 2: minimize (—) and close (×). Close is the rightmost.
        try {
            const headerBtns = Array.from(document.querySelectorAll('button[class*="header___"]'));
            if (headerBtns.length > 0) {
                // Sort by horizontal position, pick the rightmost one (the X)
                headerBtns.sort((a, b) => {
                    return b.getBoundingClientRect().right - a.getBoundingClientRect().right;
                });
                const closeBtn = headerBtns[0];
                console.log('[Trade Automation] Closing chat, button rect:', closeBtn.getBoundingClientRect());
                closeBtn.click();
            } else {
                console.warn('[Trade Automation] No header buttons found for chat close');
            }
        } catch (e) {
            console.warn('[Trade Automation] Could not close chat:', e.message);
        }
        await sleep(200);
        document.body.focus();
    }

    async function stepClickAcceptButton() {
        // Just click whatever the accept button currently says
        // (Add Money, Too Low, Too High, Accept Trade, etc.)
        // Let Weaver's script handle state transitions.
        const acceptBtn = document.querySelector('.accept-trade-button');
        if (!acceptBtn) throw new Error('Accept button not found');
        const text = acceptBtn.querySelector('.button-text')?.textContent || '';
        // If already accepted/completed, go to dashboard
        if (text === 'Accepted' || acceptBtn.disabled) {
            window.location.href = 'https://www.torn.com/trade.php';
            return;
        }
        acceptBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await sleep(500);
        // Don't auto-advance — stay on this step so the user can keep pressing Enter
        // to click the button again after state changes (e.g., after adding money).
        // Only advance if the button now says "Accepted" or is disabled.
        const updatedBtn = document.querySelector('.accept-trade-button');
        const updatedText = updatedBtn?.querySelector('.button-text')?.textContent || '';
        if (updatedText !== 'Accepted' && !updatedBtn?.disabled) {
            // Rewind step so next Enter clicks the button again
            currentStep--;
        }
    }

    async function stepDashboard() {
        window.location.href = 'https://www.torn.com/trade.php';
    }

    const STEPS = [
        stepViewReceipt,
        stepCopyMessage,
        stepOpenChat,
        stepPasteMessage,
        stepSendMessage,
        stepCloseChat,
        stepClickAcceptButton,
        stepDashboard
    ];

    // ── Keydown Listener ────────────────────────────────────────────────

    document.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;

        const tag = e.target.tagName.toLowerCase();
        const isEditable = e.target.isContentEditable;
        const isChatInput = e.target.placeholder && e.target.placeholder.toLowerCase().includes('message');

        // If in chat input at step 4 (send): let Enter send the message,
        // then advance step and blur (don't preventDefault)
        if (isChatInput && currentStep === 4) {
            // Let the Enter go through to chat (don't prevent)
            if (isProcessing) return;
            isProcessing = true;
            setTimeout(async () => {
                try {
                    await STEPS[currentStep]();
                    currentStep++;
                } catch (err) {
                    console.warn(`[Trade Automation] Step ${currentStep} failed:`, err.message);
                } finally {
                    isProcessing = false;
                    updateBadge();
                }
            }, 100);
            return;
        }

        // Don't intercept Enter in input fields, textareas, or contenteditable
        if (tag === 'input' || tag === 'textarea' || isEditable) return;

        // Check if trade changed before proceeding
        checkTradeChange();

        // Don't run if all steps are done
        if (currentStep >= STEPS.length) return;

        // Prevent double-fire
        if (isProcessing) return;
        isProcessing = true;

        e.preventDefault();
        e.stopPropagation();

        try {
            await STEPS[currentStep]();
            currentStep++;
        } catch (err) {
            console.warn(`[Trade Automation] Step ${currentStep} (${STEP_NAMES[currentStep]}) failed:`, err.message);
            // Flash badge red briefly
            badge.style.color = '#ef4444';
            badge.textContent = `⚠ ${err.message}`;
            setTimeout(() => {
                badge.style.color = '#4a9eff';
                updateBadge();
            }, 2000);
        } finally {
            isProcessing = false;
            updateBadge();
        }
    });
})();
