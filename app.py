"""
Flask server for the Gemara editor — Python/WSGI port of server.js, for
deployment on PythonAnywhere (or anywhere that runs a WSGI app).

Serves static files (html/js/css) from the repo root and the same small
REST API server.js exposes for reading/writing markup files under texts/.
The client (editor.html + js/*.js) is unchanged — this only replaces the
Node server, not the browser code.

The download/processing pipeline under scripts/ stays Node and is not part
of this file; it's meant to be run locally to produce the texts/ data,
which then gets uploaded alongside this app.

Local run:        python app.py            (dev server on PORT, default 3002)
PythonAnywhere:    point the Web app's WSGI file at the `application` object
                   defined below (see README/instructions for the exact steps).
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import unquote

import yaml
from flask import Flask, Response, abort, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
TEXTS_DIR = BASE_DIR / 'texts'

MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.gmr': 'text/plain',
    '.yaml': 'text/yaml',
}

application = Flask(__name__, static_folder=None)
app = application  # alias, for `flask run` / local convenience


# ─── Helpers ────────────────────────────────────────────────────

def ensure_texts_dir():
    TEXTS_DIR.mkdir(parents=True, exist_ok=True)


def load_labels_yaml(path):
    """labels.yaml is plain YAML; the JS server hand-parsed it only to
    avoid an npm dependency, but its shape is exactly what yaml.safe_load
    already gives us."""
    with open(path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f) or {}
    return data.get('labels') or []


def load_perakim_yaml(path):
    """Like labels.yaml, perakim.yaml is plain YAML — except start_page /
    last_page values look like "2.1" and YAML's resolver would silently
    turn those into floats. The original JS parser always kept them as
    strings, so we restore that here (nothing downstream expects a number)."""
    with open(path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f) or {}
    perakim = data.get('perakim') or []
    for p in perakim:
        if 'start_page' in p and not isinstance(p['start_page'], str):
            p['start_page'] = str(p['start_page'])
    last_page = data.get('last_page')
    if last_page is not None and not isinstance(last_page, str):
        last_page = str(last_page)
    return perakim, last_page


def list_texts_recursive(dir_path, base):
    """All files under dir_path, as base-relative POSIX paths with their
    extension stripped."""
    results = []
    for entry in sorted(dir_path.iterdir()):
        if entry.is_dir():
            results.extend(list_texts_recursive(entry, base))
        else:
            rel = entry.relative_to(base).as_posix()
            results.append(re.sub(r'\.[^.]+$', '', rel))
    return results


def fuzzy_match_path(query, path):
    if not query or not query.strip():
        return 1
    segments = [s for s in re.split(r'[/\\.]+', path.lower()) if s]
    tokens = [t for t in query.lower().split() if t]
    total = 0
    for t in tokens:
        best = 0
        for seg in segments:
            if seg == t:
                best = 10
                break
            if seg.startswith(t):
                best = max(best, 5)
            elif t in seg:
                best = max(best, 1)
        if best == 0:
            return 0
        total += best
    return total


def resolve_text_file(text_id):
    """Resolve a text id (e.g. "hulin/2.1") to a real file path, trying
    .gmr then .txt. Returns None if not found."""
    for ext in ('.gmr', '.txt'):
        candidate = TEXTS_DIR / f'{text_id}{ext}'
        if candidate.is_file():
            return candidate
    return None


def safe_id_or_400(raw_id):
    text_id = unquote(raw_id)
    if '..' in text_id:
        return None
    return text_id


# ─── API ────────────────────────────────────────────────────────

@application.get('/api/labels')
def api_labels():
    path = BASE_DIR / 'labels.yaml'
    if not path.exists():
        return jsonify({'error': 'labels.yaml not found'}), 404
    return jsonify({'labels': load_labels_yaml(path)})


@application.get('/api/masechtot')
def api_masechtot():
    ensure_texts_dir()
    masechtot = [
        entry.name for entry in sorted(TEXTS_DIR.iterdir())
        if entry.is_dir() and (entry / 'perakim.yaml').is_file()
    ]
    return jsonify({'masechtot': masechtot})


@application.get('/api/perakim/<path:masechet>')
def api_perakim(masechet):
    masechet = safe_id_or_400(masechet)
    if masechet is None:
        return jsonify({'error': 'Invalid path'}), 400
    yaml_path = TEXTS_DIR / masechet / 'perakim.yaml'
    if not yaml_path.is_file():
        return jsonify({'error': f'No perakim.yaml for "{masechet}"'}), 404
    perakim, last_page = load_perakim_yaml(yaml_path)
    return jsonify({'masechet': masechet, 'perakim': perakim, 'last_page': last_page})


@application.get('/api/texts/search')
def api_texts_search():
    ensure_texts_dir()
    q = request.args.get('q', '')
    scored = [(p, fuzzy_match_path(q, p)) for p in list_texts_recursive(TEXTS_DIR, TEXTS_DIR)]
    scored = [(p, s) for p, s in scored if s > 0]
    scored.sort(key=lambda x: -x[1])
    return jsonify({'results': [p for p, _ in scored]})


@application.get('/api/texts')
def api_texts():
    ensure_texts_dir()
    gmr_files = [f[:-4] for f in os.listdir(TEXTS_DIR) if f.endswith('.gmr')]
    return jsonify({'texts': gmr_files})


@application.get('/api/text/<path:text_id>')
def api_text_get(text_id):
    text_id = safe_id_or_400(text_id)
    if text_id is None:
        return jsonify({'error': 'Invalid path'}), 400
    found = resolve_text_file(text_id)
    if not found:
        return jsonify({'error': f'Text "{text_id}" not found'}), 404
    return jsonify({'id': text_id, 'content': found.read_text(encoding='utf-8')})


@application.put('/api/text/<path:text_id>')
def api_text_put(text_id):
    text_id = safe_id_or_400(text_id)
    if text_id is None:
        return jsonify({'error': 'Invalid path'}), 400
    found = resolve_text_file(text_id)
    file_path = found if found else TEXTS_DIR / f'{text_id}.gmr'
    file_path.parent.mkdir(parents=True, exist_ok=True)

    body = request.get_data(as_text=True) or ''
    try:
        parsed = json.loads(body)
        content = parsed.get('content') if isinstance(parsed, dict) else body
    except ValueError:
        content = body

    file_path.write_text(content, encoding='utf-8')
    return jsonify({'id': text_id, 'saved': True})


# ─── Static files ───────────────────────────────────────────────

@application.route('/', defaults={'req_path': 'editor.html'})
@application.route('/<path:req_path>')
def serve_static(req_path):
    file_path = (BASE_DIR / req_path).resolve()
    try:
        file_path.relative_to(BASE_DIR)
    except ValueError:
        abort(404)
    if not file_path.is_file():
        abort(404)

    rel = file_path.relative_to(BASE_DIR).as_posix()
    mimetype = MIME_TYPES.get(file_path.suffix)
    if mimetype:
        return send_from_directory(BASE_DIR, rel, mimetype=mimetype)
    return send_from_directory(BASE_DIR, rel)


@application.errorhandler(404)
def not_found(_err):
    return Response('Not Found', status=404)


# ─── CORS (matches server.js's local-dev-friendly headers) ──────

@application.after_request
def add_cors_headers(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, PUT, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp


@application.route('/<path:_path>', methods=['OPTIONS'])
@application.route('/', methods=['OPTIONS'])
def options_handler(_path=None):
    return Response(status=204)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '3002'))
    print(f'Gemara editor server running at http://localhost:{port}')
    application.run(host='0.0.0.0', port=port)
