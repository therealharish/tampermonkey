# Torn Dynamic Chat Drafts

This adds a suggested reply when you open a chat while Torn is the active browser tab. **Paste draft** fills Torn's composer; you review it and press Torn's Send button yourself. It never sends a Torn chat request.

The script saves up to 80 of your own manually sent replies in Tampermonkey storage. The **Style** control lets you add older replies, one per line, so suggestions sound like you sooner. Generated drafts are not recycled as style examples unless you edit them. **Clear learned replies** removes the saved examples.

## Free local setup on macOS

The default helper, `server.mjs`, uses [Ollama](https://ollama.com/) and the local `gemma3:4b` model. Your visible chat context (at most 2,500 characters) and up to 16 style examples stay on your Mac. There is no AI API key or per-reply charge. The model download is about 3.3 GB, and drafts need the Mac and Ollama running. The first draft after a restart can take longer while the model loads; the helper keeps it warm for 30 minutes.

1. Install Ollama from its [official macOS download](https://ollama.com/download/mac). Start the Ollama app, or install the Homebrew CLI with `brew install ollama` and run `ollama serve` in a terminal.
2. Download the local model once:

   ```zsh
   ollama pull gemma3:4b
   ```

3. In a second terminal, from this directory, start the helper:

   ```zsh
   node server.mjs
   ```

4. Install the [GitHub-hosted userscript](https://raw.githubusercontent.com/therealharish/tampermonkey/main/Torn%20Dynamic%20Chat/Torn%20Dynamic%20Chat.user.js) in Tampermonkey. Keep Enhanced Chat Buttons enabled; this is a separate add-on.
5. Open a Torn chat. The draft should appear above the composer. Add some of your own past replies through **Style** if you want it to sound like you immediately.

Tampermonkey uses `@updateURL` and `@downloadURL` to fetch this script from GitHub. Bump `@version` whenever you change the userscript. Updates to the local helper or model still require a local download and restart.

If the panel says **Local helper unavailable**, make sure both Ollama and `node server.mjs` are running, then click **Again**. This version has not yet been verified against a live Torn chat DOM; Torn may require a selector adjustment.

## Optional paid Grok helper

`server-grok.mjs` remains available if you want to use xAI credits instead. Run **only one helper at a time**, because both use port 8765. Grok API usage is billed per token; the free Grok app and Playground do not provide free production API calls. See [xAI pricing](https://docs.x.ai/developers/pricing).

To use that optional helper, enter your own xAI key without putting it in shell history, then run it:

```zsh
read -rs XAI_API_KEY
export XAI_API_KEY
node server-grok.mjs
```
