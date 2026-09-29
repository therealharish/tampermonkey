# Torn Dynamic Chat Drafts

This adds an AI draft to each chat you open while Torn is the active browser tab. **Paste draft** fills Torn's composer; you review it and press Torn's Send button yourself. It never sends a Torn chat request.

The script learns from replies you manually send after installation. It saves up to 80 of your own replies in Tampermonkey storage. The **Style** control also lets you paste examples of older replies, one per line. Generated drafts are not recycled as style examples unless you edit them. **Clear learned replies** removes the saved examples.

The local helper holds the xAI API key outside the browser. A generation request sends the currently visible chat text (at most 2,500 characters) and up to 16 of your saved style examples to xAI. It uses `grok-4.3` with reasoning disabled for short, quick drafts and `store: false` for each request. It runs only when Torn is visible and focused; generation on a new chat is automatic, and **Again** requests another draft. The userscript caps generation at 100 requests per UTC day to limit accidental spending.

**Grok API calls are billed per token.** The free Grok app and free API Playground do not include free production API calls. Check the [current xAI pricing](https://docs.x.ai/developers/pricing) and use prepaid credits if you want a hard spending boundary.

## Setup on macOS

1. Create an API key in the [xAI Console](https://console.x.ai/). Check available API credits and billing before using it.
2. Open a terminal in this directory. Enter the key without placing it in shell history:

   ```zsh
   read -rs XAI_API_KEY
   export XAI_API_KEY
   node server.mjs
   ```

   Paste **only the generated API key** when `read` waits; the terminal will not echo it. Press Return, then leave the helper running. Press Ctrl-C to stop it. The helper listens only on `127.0.0.1:8765`.
3. Install the [GitHub-hosted userscript](https://raw.githubusercontent.com/therealharish/tampermonkey/main/Torn%20Dynamic%20Chat/Torn%20Dynamic%20Chat.user.js) in Tampermonkey. Keep your existing Enhanced Chat Buttons script enabled; this is a separate add-on. Tampermonkey checks the script's `@updateURL` and downloads a newer `@version` from `@downloadURL`. Bump `@version` on every future script update. Updates to `server.mjs` still require you to pull or download the new helper and restart it locally.
4. Open a chat in Torn. The draft should appear above the composer. Add several of your own replies through **Style** if you want it to sound like you immediately.

If the panel says **Local helper unavailable**, check that the terminal still shows the helper running and click **Again**. This version has not yet been verified against a live Torn chat DOM; Torn changes its chat markup periodically, so a selector adjustment may be needed after a browser check.
