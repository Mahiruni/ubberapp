#!/usr/bin/env python3
"""Safely install a role-specific Firebase Android config from a GitHub Actions secret.

Accept the Base64-encoded *Android* google-services.json (preferred), or original
JSON text. Fail with actionable errors while never printing the secret itself.
"""
import base64
import binascii
import json
import os
import re
import sys
from pathlib import Path

def fail(message: str) -> None:
    print(f"::error title=NexRide Firebase configuration::{message}", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) != 2 or sys.argv[1] not in ("driver", "rider"):
    fail("Expected one Android role: driver or rider.")
role = sys.argv[1]
expected = f"com.nexride.{role}"
secret = os.environ.get("FIREBASE_CONFIG_B64", "").strip()
if not secret:
    fail(f"The {role.upper()} Firebase GitHub Action secret is missing or empty.")

# The user may have pasted raw JSON rather than Base64. Both are safe inputs
# once package identity, JSON shape and the absence of private keys are checked.
if secret.startswith("\ufeff"):
    secret = secret.lstrip("\ufeff")
if secret.startswith("{"):
    raw = secret
else:
    normalized = re.sub(r"\s+", "", secret.strip("\"'"))
    if not re.fullmatch(r"[A-Za-z0-9+/]*={0,2}", normalized or " "):
        fail("Secret is not Base64. Use the full encoded google-services.json or paste raw JSON text.")
    try:
        raw = base64.b64decode(normalized, validate=True).decode("utf-8-sig")
    except (binascii.Error, ValueError, UnicodeError):
        fail("Secret cannot be decoded as Base64 JSON. Recreate the GitHub secret from the correct Android google-services.json.")
try:
    config = json.loads(raw)
except (ValueError, TypeError):
    fail("Secret decoded, but it is not valid JSON from Firebase Android.")
if not isinstance(config, dict):
    fail("Firebase Android configuration must be a JSON object.")
if "private_key" in config or config.get("type") == "service_account":
    fail("This is a Firebase ADMIN service-account key, not Android google-services.json. Never put the private key in an APK.")
if not isinstance(config.get("project_info"), dict) or not config["project_info"].get("project_id"):
    fail("Missing project_info.project_id: download the Android google-services.json from Firebase Project settings > General.")
clients = config.get("client")
if not isinstance(clients, list):
    fail("Missing client list: this is not a valid Android google-services.json.")
packages = [
    x.get("client_info", {}).get("android_client_info", {}).get("package_name")
    for x in clients if isinstance(x, dict)
]
if expected not in packages:
    # Android package IDs are public identifiers; never print tokens/API keys.
    actual = ", ".join(str(p) for p in packages if p) or "(none)"
    fail(f"Wrong Firebase Android app: expected {expected}; file contains package(s): {actual}. Download the correct Driver/Rider app config.")
destination = Path("android/app/google-services.json")
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(config, separators=(",", ":")), encoding="utf-8")
print(f"NexRide {role} Firebase Android configuration verified: {expected}")
