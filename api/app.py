from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from config import Config
import json
import os
import subprocess
from datetime import datetime, timezone

app = Flask(__name__, static_folder='../static')
app.config.from_object(Config)
CORS(app)

VALID_STATUSES = ['BACKLOG', 'PLANNED', 'NEXT', 'IN_PROGRESS', 'DONE']
REQUIRED_FIELDS = ['name']
ROADMAP_FILE = Config.ROADMAP_FILE


# --- Data helpers ---

def load_roadmap():
    with open(ROADMAP_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_roadmap(data):
    data['last_updated'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    # Recompute metadata
    items = data.get('items', [])
    data['metadata']['total_items'] = len(items)
    data['metadata']['categories'] = sorted(set(i['category'] for i in items))
    with open(ROADMAP_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    if Config.GIT_AUTO_COMMIT:
        git_commit()


def git_commit():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    ts = datetime.now().strftime('%Y-%m-%d %H:%M')
    try:
        subprocess.run(['git', 'add', 'data/roadmap.json'], cwd=repo_root,
                       capture_output=True, check=True)
        subprocess.run(['git', 'commit', '-m', f'Roadmap update: {ts}'], cwd=repo_root,
                       capture_output=True, check=True)
    except subprocess.CalledProcessError:
        pass  # Silently skip if nothing to commit or git unavailable


def next_id(items):
    return max((i['id'] for i in items), default=0) + 1


def find_item(items, item_id):
    for i, item in enumerate(items):
        if item['id'] == item_id:
            return i, item
    return None, None


def today_str():
    return datetime.now().strftime('%Y-%m-%d')


def make_item(data, item_id):
    return {
        'id': item_id,
        'name': data['name'],
        'category': data.get('category', 'Uncategorized'),
        'description': data.get('description', ''),
        'business_impact': data.get('business_impact', ''),
        'outcome': data.get('outcome', 'TBD - define after initial build'),
        'success_metric': data.get('success_metric', 'TBD'),
        'impact_score': float(data.get('impact_score', 0)),
        'ease_score': float(data.get('ease_score', 0)),
        'priority_score': float(data.get('priority_score', 0)),
        'build_time': data.get('build_time', ''),
        'phase': data.get('phase', ''),
        'status': data.get('status', 'BACKLOG'),
        'start_date': data.get('start_date'),
        'completed_date': data.get('completed_date'),
        'dependencies': data.get('dependencies', ''),
        'votes': [],
        'vote_count': 0,
        'n8n_workflows': data.get('n8n_workflows', []),
        'owner': data.get('owner', 'Zev'),
        'added_date': today_str(),
    }


def validate_item_input(data, require_name=True):
    if not data or not isinstance(data, dict):
        return 'Request body must be a JSON object'
    if require_name and not data.get('name', '').strip():
        return 'Field "name" is required and cannot be empty'
    if 'status' in data and data['status'] not in VALID_STATUSES:
        return f'Invalid status. Must be one of: {", ".join(VALID_STATUSES)}'
    for field in ['impact_score', 'ease_score', 'priority_score']:
        if field in data:
            try:
                val = float(data[field])
                if not (0 <= val <= 10):
                    return f'{field} must be between 0 and 10'
            except (ValueError, TypeError):
                return f'{field} must be a number'
    return None


def apply_status_dates(item, new_status):
    """Auto-set dates based on status transitions."""
    if new_status == 'IN_PROGRESS' and not item.get('start_date'):
        item['start_date'] = today_str()
    if new_status == 'DONE' and not item.get('completed_date'):
        item['completed_date'] = today_str()


# --- Static files ---

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)


# --- Health ---

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})


# --- Roadmap ---

@app.route('/api/roadmap')
def get_roadmap():
    return jsonify(load_roadmap())


@app.route('/api/roadmap/items')
def get_items():
    data = load_roadmap()
    status = request.args.get('status')
    category = request.args.get('category')
    items = data['items']
    if status:
        items = [i for i in items if i['status'] == status.upper()]
    if category:
        items = [i for i in items if i['category'].lower() == category.lower()]
    return jsonify(items)


@app.route('/api/roadmap/items/<int:item_id>')
def get_item(item_id):
    data = load_roadmap()
    _, item = find_item(data['items'], item_id)
    if item is None:
        return jsonify({'error': f'Item {item_id} not found'}), 404
    return jsonify(item)


@app.route('/api/roadmap/items', methods=['POST'])
def create_item():
    body = request.get_json(silent=True)
    error = validate_item_input(body)
    if error:
        return jsonify({'error': error}), 400

    data = load_roadmap()
    new_id = next_id(data['items'])
    item = make_item(body, new_id)
    apply_status_dates(item, item['status'])
    data['items'].append(item)
    save_roadmap(data)
    return jsonify(item), 201


@app.route('/api/roadmap/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    body = request.get_json(silent=True)
    error = validate_item_input(body)
    if error:
        return jsonify({'error': error}), 400

    data = load_roadmap()
    idx, existing = find_item(data['items'], item_id)
    if existing is None:
        return jsonify({'error': f'Item {item_id} not found'}), 404

    updated = make_item(body, item_id)
    # Preserve fields that shouldn't be overwritten on full update
    updated['added_date'] = existing.get('added_date', today_str())
    updated['votes'] = existing.get('votes', [])
    updated['vote_count'] = existing.get('vote_count', 0)
    # Carry forward existing dates unless explicitly provided
    if 'start_date' not in body:
        updated['start_date'] = existing.get('start_date')
    if 'completed_date' not in body:
        updated['completed_date'] = existing.get('completed_date')
    apply_status_dates(updated, updated['status'])
    data['items'][idx] = updated
    save_roadmap(data)
    return jsonify(updated)


@app.route('/api/roadmap/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    data = load_roadmap()
    idx, existing = find_item(data['items'], item_id)
    if existing is None:
        return jsonify({'error': f'Item {item_id} not found'}), 404
    data['items'].pop(idx)
    save_roadmap(data)
    return jsonify({'deleted': item_id})


@app.route('/api/roadmap/items/<int:item_id>/status', methods=['PUT'])
def update_status(item_id):
    body = request.get_json(silent=True)
    if not body or 'status' not in body:
        return jsonify({'error': 'Field "status" is required'}), 400
    new_status = body['status'].upper()
    if new_status not in VALID_STATUSES:
        return jsonify({'error': f'Invalid status. Must be one of: {", ".join(VALID_STATUSES)}'}), 400

    data = load_roadmap()
    idx, item = find_item(data['items'], item_id)
    if item is None:
        return jsonify({'error': f'Item {item_id} not found'}), 404

    item['status'] = new_status
    apply_status_dates(item, new_status)
    data['items'][idx] = item
    save_roadmap(data)
    return jsonify(item)


# --- Backlog (Phase 2/3 stubs) ---

@app.route('/api/backlog')
def get_backlog():
    data = load_roadmap()
    return jsonify(data.get('backlog', []))


@app.route('/api/backlog', methods=['POST'])
def submit_backlog():
    return jsonify({'error': 'Not implemented — backlog submission coming in Phase 2'}), 501


# --- Voting (Phase 2 stub) ---

@app.route('/api/roadmap/items/<int:item_id>/vote', methods=['POST'])
def vote_item(item_id):
    return jsonify({'error': 'Not implemented — voting coming in Phase 2'}), 501


# --- Error handlers ---

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(400)
def bad_request(e):
    return jsonify({'error': 'Bad request'}), 400


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=Config.PORT)
