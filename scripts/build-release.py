#!/usr/bin/env python3
"""Build the mainline single-HTML release without touching experiments or archives."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

location = Path(__file__).resolve().parent
if (location.parent / 'release.json').is_file():
    # A normal public clone: scripts/, src/, release.json and the HTML share one root.
    project = location.parent
    source_root = project / 'src'
    config_path = project / 'release.json'
else:
    # Preserve the established local workspace and its version archive location.
    source_root = location / 'src'
    config_path = location / '发布配置.json'
    workspace = location.parent
    candidate = workspace.parent.parent
    nested_workspace = workspace.parent.name == '实验分支'
    project = candidate if nested_workspace and (candidate / 'AGENTS.md').is_file() else workspace
config = json.loads(config_path.read_text(encoding='utf-8'))
version = config['version']
if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
    raise ValueError('A stable three-part SemVer release is required.')
name = config.get('output', '不背法语-' + version + '.html')
if Path(name).name != name or not name.endswith('.html'):
    raise ValueError('Release output must be an HTML filename at the project root.')
source = source_root / 'release-build.html'
subprocess.run([sys.executable, str(source_root / 'build.py'), '--output', str(source)], check=True)
html = source.read_text(encoding='utf-8')
marker = 'window.CARNET_ENABLED=true;window.CARNET_PREVIEW=true;'
if html.count(marker) != 1:
    raise ValueError('Missing or ambiguous startup mode.')
html = html.replace(marker, 'window.VOCAB_RELEASE=' + json.dumps(version) + ';window.CARNET_ENABLED=true;window.CARNET_PREVIEW=false;', 1)
html = html.replace('<title>不背法语 · CARNET 视觉验收</title>', '<title>不背法语 · ' + version + '</title>\n<meta name="application-version" content="' + version + '">', 1)
# Release files must never embed a user's portable backup or imported recordings.
if re.search(r'<script[^>]+id=[\"\']portable-state[\"\']', html, re.I):
    raise ValueError('A public release cannot embed personal portable state.')
output = project / name
output.write_text(html, encoding='utf-8')
print(json.dumps({'release': version, 'output': str(output), 'bytes': output.stat().st_size,
                  'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                  'backupFormat': 4, 'preview': False}, ensure_ascii=False, indent=2))
