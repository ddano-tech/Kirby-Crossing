#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .draft-venv
.draft-venv/bin/python -m pip install --disable-pip-version-check 'libWiiPy==0.6.0'
.draft-venv/bin/python -m native_bridge.desktop
