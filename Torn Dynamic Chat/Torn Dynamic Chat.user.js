// ==UserScript==
// @name         Torn Dynamic Chat Drafts
// @namespace    harishh.torn.dynamic-chat
// @version      0.3.0
// @description  Suggests a reply for the chat you open; only you can send it.
// @license      GPLv3
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @updateURL    https://raw.githubusercontent.com/therealharish/tampermonkey/main/Torn%20Dynamic%20Chat/Torn%20Dynamic%20Chat.user.js
// @downloadURL  https://raw.githubusercontent.com/therealharish/tampermonkey/main/Torn%20Dynamic%20Chat/Torn%20Dynamic%20Chat.user.js
// ==/UserScript==

(() => {
    'use strict';

    const SERVICE_URL = 'http://127.0.0.1:8765/generate';
    const STORAGE_KEY = 'torn-dynamic-chat-own-replies-v1';
    const MAX_SAMPLES = 80;
    const MAX_CONTEXT = 2500;
    const states = new WeakMap();
    const known = new Set();

    GM_addStyle(`
        .tdc-panel { margin: 5px 8px; padding: 7px; border: 1px solid var(--chat-box-input-border, #666);
            border-radius: 6px; background: var(--chat-box-bg, #222); color: var(--chat-box-label-info, #eee);
            font: 12px/1.35 Arial, sans-serif; }
        .tdc-row { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
        .tdc-draft { margin: 5px 0; white-space: pre-wrap; max-height: 90px; overflow: auto; }
        .tdc-panel button { cursor: pointer; padding: 3px 7px; }
        .tdc-panel button:disabled { cursor: default; opacity: .55; }
        .tdc-status { opacity: .75; }
        .tdc-style { display: none; margin-top: 6px; }
        .tdc-style[open] { display: block; }
        .tdc-style textarea { box-sizing: border-box; width: 100%; min-height: 65px; }
    `);

    function readSamples() {
        const value = GM_getValue(STORAGE_KEY, []);
        return Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(-MAX_SAMPLES) : [];
    }

    function saveSample(text) {
        const clean = text.trim().replace(/\s+/g, ' ').slice(0, 500);
        if (clean.length < 3) return;
        const samples = readSamples();
        if (samples.at(-1) === clean) return;
        samples.push(clean);
        GM_setValue(STORAGE_KEY, samples.slice(-MAX_SAMPLES));
    }

    function chatFor(element) {
        return element.closest('[id^="private-"], [id^="faction-"], [id^="company-"], [id^="public_"], [class*="chat-box___"]');
    }

    function visible(element) {
        return !!(element && element.isConnected && element.getClientRects().length);
    }

    function composer(chat) {
        return chat?.querySelector('[class*="textarea___"], textarea');
    }

    function chatContext(chat) {
        const body = chat.querySelector('[class*="messages___"], [class*="chat-box-body___"], [class*="message-list___"]');
        if (body?.innerText?.trim()) return body.innerText.trim().slice(-MAX_CONTEXT);
        const copy = (body || chat).cloneNode(true);
        copy.querySelectorAll('textarea, input, button, .tdc-panel, [class*="chat-box-footer___"], [class*="chat-box-header___"]').forEach(node => node.remove());
        return (copy.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(-MAX_CONTEXT);
    }

    function chatLabel(chat) {
        return (chat.querySelector('[class*="chat-box-header__name___"], [class*="title___"]')?.textContent || 'this chat').trim().slice(0, 80);
    }

    function requestDraft(chat, state) {
        if (!visible(chat) || document.visibilityState !== 'visible' || !document.hasFocus()) return;
        if (composer(chat)?.value.trim()) return; // Preserve anything the player is typing.
        const context = chatContext(chat);
        if (!context) {
            state.status.textContent = 'Open a conversation with messages to get a draft.';
            return;
        }
        const sequence = ++state.sequence;
        state.draft = '';
        state.draftNode.textContent = '';
        state.status.textContent = 'Writing a reply…';
        state.paste.disabled = true;
        state.again.disabled = true;
        const payload = JSON.stringify({ context, chat: chatLabel(chat), samples: readSamples().slice(-16) });
        GM_xmlhttpRequest({
            method: 'POST', url: SERVICE_URL, data: payload, timeout: 45000,
            headers: { 'Content-Type': 'application/json' },
            onload: response => {
                if (sequence !== state.sequence || !visible(chat)) return;
                try {
                    const result = JSON.parse(response.responseText);
                    if (response.status !== 200) throw new Error(result.error || `Helper returned ${response.status}`);
                    const draft = String(result.draft || '').trim().slice(0, 500);
                    if (!draft) throw new Error('AI returned an empty draft');
                    state.draft = draft;
                    state.draftNode.textContent = draft;
                    state.status.textContent = `${readSamples().length} style examples saved locally`;
                    state.paste.disabled = false;
                } catch (error) {
                    state.status.textContent = error.message;
                }
                state.again.disabled = false;
            },
            ontimeout: () => fail('Draft timed out. Try Again.'),
            onerror: () => fail('Local helper unavailable. Start it, then try Again.')
        });
        function fail(message) {
            if (sequence !== state.sequence) return;
            state.status.textContent = message;
            state.again.disabled = false;
        }
    }

    function makePanel(chat) {
        const input = composer(chat);
        if (!input || !visible(input)) return;
        const panel = document.createElement('section');
        panel.className = 'tdc-panel';
        panel.setAttribute('aria-label', 'AI chat draft');
        panel.innerHTML = '<div class="tdc-row"><strong>AI draft</strong><span class="tdc-status"></span></div><div class="tdc-draft"></div><div class="tdc-row"><button type="button" class="tdc-paste" disabled>Paste draft</button><button type="button" class="tdc-again">Again</button><button type="button" class="tdc-style-button">Style</button></div><div class="tdc-style"><p>Add examples of replies you wrote, one per line. Saved only in Tampermonkey.</p><textarea aria-label="Your reply examples"></textarea><div class="tdc-row"><button type="button" class="tdc-save">Save examples</button><button type="button" class="tdc-clear">Clear learned replies</button></div></div>';
        const state = {
            panel, sequence: 0, draft: '', lastInserted: '',
            status: panel.querySelector('.tdc-status'),
            draftNode: panel.querySelector('.tdc-draft'),
            paste: panel.querySelector('.tdc-paste'),
            again: panel.querySelector('.tdc-again')
        };
        state.status.textContent = 'Ready';
        state.paste.addEventListener('click', () => {
            const field = composer(chat);
            if (!field || !state.draft) return;
            if (field.value.trim() && field.value !== state.draft) {
                state.status.textContent = 'Composer has your text. Clear it before pasting a draft.';
                return;
            }
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) setter.call(field, state.draft);
            else field.value = state.draft;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.focus();
            state.lastInserted = state.draft;
        });
        state.again.addEventListener('click', () => requestDraft(chat, state));
        const style = panel.querySelector('.tdc-style');
        panel.querySelector('.tdc-style-button').addEventListener('click', () => { style.toggleAttribute('open'); });
        panel.querySelector('.tdc-save').addEventListener('click', () => {
            const field = style.querySelector('textarea');
            field.value.split(/\n+/).forEach(saveSample);
            field.value = '';
            state.status.textContent = `${readSamples().length} style examples saved locally`;
        });
        panel.querySelector('.tdc-clear').addEventListener('click', () => {
            if (window.confirm('Delete all locally saved reply examples?')) {
                GM_setValue(STORAGE_KEY, []);
                state.status.textContent = 'Style examples cleared';
            }
        });
        const footer = input.closest('[class*="chat-box-footer___"]') || input.parentElement;
        footer.insertAdjacentElement('beforebegin', panel);
        states.set(chat, state);
        requestDraft(chat, state);
    }

    function scan() {
        const root = document.querySelector('#chatRoot');
        if (!root) return;
        root.querySelectorAll('textarea, [class*="textarea___"]').forEach(input => {
            const chat = chatFor(input);
            if (!chat || !visible(chat) || !visible(input)) return;
            known.add(chat);
            const state = states.get(chat);
            if (!state || !state.panel.isConnected) makePanel(chat);
        });
        for (const chat of known) {
            if (!chat.isConnected) { known.delete(chat); continue; }
            const state = states.get(chat);
            if (state && !visible(chat)) state.sequence++;
        }
    }

    function noteManualSend(event) {
        if (!event.isTrusted) return;
        const target = event.target;
        const chat = chatFor(target);
        if (!chat || !visible(chat)) return;
        const input = composer(chat);
        if (!input) return;
        if (event.type === 'keydown') {
            if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.isComposing || target !== input) return;
        } else {
            const button = target.closest('button');
            if (!button || button.closest('.tdc-panel')) return;
            const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`;
            if (!/\bsend\b/i.test(label)) return;
        }
        const value = input.value.trim();
        if (!value) return;
        setTimeout(() => {
            if (input.value.trim()) return; // Torn did not clear the composer.
            const state = states.get(chat);
            if (value !== state?.lastInserted) saveSample(value);
            if (state) state.lastInserted = '';
        }, 800);
    }

    document.addEventListener('keydown', noteManualSend, true);
    document.addEventListener('click', noteManualSend, true);
    let queued = false;
    function scheduleScan() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; scan(); });
    }
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', scheduleScan);
    window.addEventListener('focus', scheduleScan);
    scheduleScan();
})();
