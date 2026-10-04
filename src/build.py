#!/usr/bin/env python3
"""Build the editable sources into one offline-capable HTML deliverable.

Usage: python3 build.py [--state exported-backup.json] [--output filename.html]
                       [--project-license /path/to/LICENSE]
All outputs must remain under this build directory. Publication/archival is separate.
"""
from pathlib import Path
import argparse
import hashlib
import html
import json
import re

ROOT = Path(__file__).resolve().parent


def local_source(name):
    path = (ROOT / name).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError(f'Bundled source is unavailable or outside build directory: {name}')
    return path.read_text(encoding='utf-8')


def escape_script(source):
    # HTML recognizes the closing tag without regard to case, even in JS strings.
    # Escaping the slash preserves JavaScript string values and comment contents.
    return re.sub(r'</script', lambda m: '<\\/' + m.group(0)[2:], source, flags=re.I)


def json_script(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')


def required_notice(path, label):
    if not path.is_file():
        raise ValueError('Missing required license or notice: ' + label + ' (' + str(path) + ')')
    content = path.read_text(encoding='utf-8')
    if not content.strip():
        raise ValueError('Empty required license or notice: ' + label + ' (' + str(path) + ')')
    return content


def project_license_text(path=None):
    if path is None:
        # Public checkout: LICENSE + src/. Local checkout: LICENSE + 开发资料/src/.
        candidates = [ROOT.parent / 'LICENSE', ROOT.parent.parent / 'LICENSE']
        matches = [candidate for candidate in candidates if candidate.is_file()]
        if len(matches) != 1:
            raise ValueError('Expected one project LICENSE in src/.. or src/../..; '
                             'use --project-license to select its exact location.')
        path = matches[0]
    return required_notice(Path(path).resolve(), '不背法语 — MIT License')


def build(output, portable=None, project_license=None):
    own_license = project_license_text(project_license)
    source = local_source('index.html')
    included = []
    script_pattern = re.compile(r'<script\b[^>]*\bsrc\s*=\s*([\'"])(.*?)\1[^>]*>\s*</script\s*>', re.I)
    def inline_script(match):
        name = match.group(2)
        body = local_source(name)
        included.append(name)
        prefix = ''
        if name == 'app.js' and portable is not None:
            prefix = '<script id="portable-state" type="application/json">' + json_script(portable) + '</script>\n'
        return prefix + '<script data-bundled-source="' + html.escape(name, quote=True) + '">\n' + escape_script(body) + '\n</script>'
    source = script_pattern.sub(inline_script, source)
    def inline_style(match):
        name = match.group(2)
        included.append(name)
        css = local_source(name)
        if re.search(r'</style', css, flags=re.I):
            raise ValueError('Unexpected HTML closing style tag in CSS; review before bundling.')
        group = re.search(r'data-design-style=[\"\'](atelier|classic)[\"\']', match.group(0))
        attrs = (' data-design-style="' + group.group(1) + '" media="' + ('all' if group.group(1) == 'atelier' else 'not all') + '"') if group else ''
        return '<style data-bundled-source="' + html.escape(name, quote=True) + '"' + attrs + '>\n' + css + '\n</style>'
    source = re.sub(r'<link\b[^>]*\brel\s*=\s*[\'"]stylesheet[\'"][^>]*\bhref\s*=\s*([\'"])(.*?)\1[^>]*>', inline_style, source, flags=re.I)
    if re.search(r'<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel\s*=\s*[\'"]stylesheet', source, flags=re.I):
        raise ValueError('Some stylesheet or script references remain external.')
    notices = []
    for label, path in [
        ('ts-fsrs 5.4.2 — MIT License', ROOT / 'vendor/fsrs-LICENSE.txt'),
        ('Alea, included in ts-fsrs — MIT License', ROOT / 'vendor/alea-LICENSE.txt'),
        ('Three.js 0.160.1 — MIT License', ROOT / 'vendor/three-LICENSE.txt'),
        ('Earcut 2.2.4, included in Three.js — ISC License', ROOT / 'vendor/earcut-LICENSE.txt'),
        ('Lenis 1.3.26 — MIT License', ROOT / 'vendor/lenis-LICENSE.txt'),
        ('SheetJS CE 0.20.3 — Apache License 2.0', ROOT / 'vendor/xlsx-LICENSE.txt'),
        ('Cormorant Garamond 4.001 — SIL Open Font License 1.1', ROOT / 'vendor/Cormorant-OFL.txt'),
        ('Third-party and asset notices', ROOT / 'vendor/THIRD_PARTY_NOTICES.md'),
    ]:
        notices.append(label + '\n\n' + required_notice(path, label))
    notice_block = '\n<script type="text/plain" id="project-license">\n' + escape_script(own_license) + '\n</script>\n'
    notice_block += '<script type="text/plain" id="third-party-licenses">\n' + escape_script('\n\n'.join(notices)) + '\n</script>\n'
    body_matches = list(re.finditer(r'</body\s*>', source, re.I))
    if not body_matches:
        raise ValueError('Missing closing HTML body tag')
    body_end = body_matches[-1].start()
    source = source[:body_end] + notice_block + source[body_end:]
    if not re.search(r'</body\s*>\s*</html\s*>\s*$', source, re.I):
        raise ValueError('Bundle must end with intact body/html closing tags')
    output = Path(output).resolve()
    if not output.is_relative_to(ROOT):
        raise ValueError('Build output must remain within ' + str(ROOT))
    output.write_text(source, encoding='utf-8')
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(json.dumps({'output':str(output), 'bytes':output.stat().st_size, 'sha256':digest, 'bundled':included, 'portableState':portable is not None}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'不背法语-CARNET-视觉验收.html')
    parser.add_argument('--project-license', type=Path, help='Explicit project LICENSE; otherwise check the two documented parent locations.')
    args = parser.parse_args()
    portable = None
    if args.state:
        portable = json.loads(args.state.read_text(encoding='utf-8'))
        if not isinstance(portable, dict) or portable.get('version') != 4:
            parser.error('--state must contain a version 4 state or exported backup')
    build(args.output, portable, args.project_license)
