#!/usr/bin/env python3
"""Configure role-isolated Android binaries and install the native Play update bridge."""
import os
from pathlib import Path
import re

role = os.environ.get("NEXRIDE_ROLE")
if role not in ("rider", "driver"):
    raise SystemExit("NEXRIDE_ROLE must be rider or driver")

name = "NEXRIDE_" + role.upper() + "_ANDROID_VERSION_CODE"
raw = os.environ.get(name, "1")
if not raw.isascii() or not raw.isdecimal() or int(raw) < 1 or int(raw) > 2100000000:
    raise SystemExit("Invalid Android version code for " + role)
code = int(raw)

src = Path("native/android/NexRideUpdatesPlugin.java")
dest = Path("android/app/src/main/java/com/nexride/updates/NexRideUpdatesPlugin.java")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(src.read_text())

activity = Path("android/app/src/main/java/com/nexride/" + role + "/MainActivity.java")
if not activity.exists():
    raise SystemExit("Capacitor did not generate the expected role activity: " + str(activity))
activity.write_text(
    "package com.nexride." + role + ";\n\n"
    "import android.os.Bundle;\n"
    "import com.getcapacitor.BridgeActivity;\n"
    "import com.nexride.updates.NexRideUpdatesPlugin;\n\n"
    "public class MainActivity extends BridgeActivity {\n"
    "  @Override public void onCreate(Bundle state) {\n"
    "    registerPlugin(NexRideUpdatesPlugin.class);\n"
    "    super.onCreate(state);\n"
    "  }\n}\n"
)

gradle = Path("android/app/build.gradle")
body = gradle.read_text()
body, n = re.subn(r"versionCode\s+\d+", "versionCode " + str(code), body, count=1)
if n != 1:
    raise SystemExit("Android versionCode was not found")
if "com.google.android.play:app-update:" not in body:
    if "dependencies {" not in body:
        raise SystemExit("Gradle dependencies section missing")
    body = body.replace("dependencies {", "dependencies {\n    implementation 'com.google.android.play:app-update:2.1.0'", 1)
gradle.write_text(body)
print("Configured NexRide", role, "Android version code", code, "with Google Play Immediate Updates")
