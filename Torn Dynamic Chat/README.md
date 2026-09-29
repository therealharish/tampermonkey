# Torn Dynamic Chat Drafts

The userscript prepares a suggested reply when you open a visible Torn chat. **Paste draft** fills Torn's composer; you review it and press Torn's Send button yourself. It never sends a Torn chat request. It stores up to 80 of your own manually sent replies in Tampermonkey, sends the most recent 16 style examples and at most 2,500 characters of visible chat to your build VM, and the VM sends those to Google's Gemini API. The **Style** control can add older examples. **Clear learned replies** deletes them locally.

Google currently lists [`gemini-3.1-flash-lite` as free for input and output tokens](https://ai.google.dev/gemini-api/docs/pricing), subject to [your project's active rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). Google's free tier may use submitted data to improve its products. A free API key is not placed in this repository or in the userscript; [Google recommends a backend proxy for client apps](https://ai.google.dev/gemini-api/docs/api-key).

## Build VM setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey) in a free-tier project. Keep the key private.
2. Copy this directory to `/data/hdd/athens/torn-dynamic-chat` on `harishh-cs-bld.insieme.local`. Run `python3 -B configure_vm.py` there. It prompts privately for the Gemini key, creates a separate random chat access token, and saves both in owner-only files. The key must never be entered into Torn or Tampermonkey.
3. Provide a browser reachable **HTTPS** endpoint to the VM. For an existing HTTPS reverse proxy, forward `/generate` to `http://127.0.0.1:8765/generate`. If the Python service itself handles HTTPS, supply a browser trusted certificate and key to `configure_vm.py`; it will listen on port 8765. An untrusted or self-signed certificate will not work without an explicit trust setup. Never expose a plain HTTP endpoint with the access token.
4. Copy `torn-dynamic-chat.service` to `~/.config/systemd/user/`, then run `systemctl --user daemon-reload && systemctl --user enable --now torn-dynamic-chat.service`. Verify `curl http://127.0.0.1:8765/health` on the VM when using a reverse proxy, or `curl https://YOUR_HOST:8765/health` for direct TLS.
5. Install the [GitHub-hosted userscript](https://raw.githubusercontent.com/therealharish/tampermonkey/main/Torn%20Dynamic%20Chat/Torn%20Dynamic%20Chat.user.js) in Tampermonkey. Open a chat, choose **Setup**, enter the HTTPS `/generate` URL and the value from the VM's `access-token.txt`. This token is stored in Tampermonkey on that browser. The script then prepares drafts on chat open. Keep Enhanced Chat Buttons enabled; this is a separate add-on.

Tampermonkey uses `@updateURL` and `@downloadURL` to fetch script updates from GitHub when `@version` increases. Server changes require updating the VM copy and restarting the user service. The VM proxy rejects requests without the separate access token, bounds input size, and caps calls to 100 per 24 hours per service process. It does not store chat context or generated drafts.

This has not yet been verified against a live Torn chat DOM; Torn may require a selector adjustment.

## Development checks

Run `python3 -B -m unittest test_server_gemini.py` for proxy validation and `node --check 'Torn Dynamic Chat.user.js'` for script syntax.

The previous local Ollama helper (`server.mjs`) and optional paid Grok helper (`server-grok.mjs`) remain in the directory for reference. Neither is used by the Gemini userscript.
