"""One-time interactive VM setup. Never prints or commits the Gemini API key."""

import getpass
import os
import pathlib
import re
import secrets

ROOT = pathlib.Path(__file__).resolve().parent


def main():
    key = getpass.getpass("Paste your Gemini API key: ").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", key):
        raise SystemExit("That does not look like a Gemini API key; nothing saved")
    token = secrets.token_hex(32)
    cert = input("HTTPS certificate path on VM (blank for loopback behind HTTPS reverse proxy): ").strip()
    tls_key = input("HTTPS private key path on VM (blank for reverse proxy): ").strip()
    if bool(cert) != bool(tls_key):
        raise SystemExit("Provide both HTTPS certificate and private key paths")
    for path in (cert, tls_key):
        if path and (not os.path.isabs(path) or "\n" in path or '"' in path):
            raise SystemExit("Certificate paths must be absolute and contain no quotes")
    env = ["GEMINI_API_KEY={}".format(key), "CHAT_ACCESS_TOKEN={}".format(token)]
    if cert:
        env += ["CHAT_HOST=0.0.0.0", "CHAT_TLS_CERT={}".format(cert),
                "CHAT_TLS_KEY={}".format(tls_key)]
    path = ROOT / "private.env"
    descriptor = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as file:
        file.write("\n".join(env) + "\n")
    os.chmod(str(path), 0o600)
    token_path = ROOT / "access-token.txt"
    descriptor = os.open(str(token_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as file:
        file.write(token + "\n")
    os.chmod(str(token_path), 0o600)
    print("Saved private.env and access-token.txt with owner-only permissions.")
    print("Use access-token.txt for the userscript Setup button. Never paste the Gemini API key there.")


if __name__ == "__main__":
    main()
