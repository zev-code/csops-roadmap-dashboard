from functools import wraps
from flask import Flask, jsonify, request, send_from_directory, redirect, url_for, render_template
from flask_cors import CORS
from flask_login import login_required, current_user, login_user, logout_user
from config import Config
from auth import login_manager, authenticate, init_oauth, oauth, is_email_allowed, get_or_create_user
import hmac
import json
import os
import subprocess
from datetime import datetime, timezone

app = Flask(__name__, static_folder='../static', template_folder='../templates')
app.config.from_object(Config)
CORS(app, supports_credentials=True)

# --- Auth setup ---
login_manager.init_app(app)
init_oauth(app)


@login_manager.unauthorized_handler
def unauthorized():
    """Return 401 JSON instead of redirecting to login page."""
    return jsonify({'error': 'Authentication required'}), 401

VALID_STATUSES = ['BACKLOG', 'PLANNED', 'NEXT', 'IN_PROGRESS', 'DONE']
REQUIRED_FIELDS = ['name']
ROADMAP_FILE = Config.ROADMAP_FILE
TRACKED_FIELDS = [
    'status', 'category', 'build_time', 'description', 'business_impact',
    'outcome', 'success_metric', 'impact_score', 'ease_score',
    'priority_score', 'start_date', 'completed_date',
    'expected_delivery', 'owner', 'dependencies',
]


# --- Data helpers ---

def load_roadmap():
    with open(ROADMAP_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_roadmap(data):
    data['last_updated'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    # Recompute metadata
    items = data.get('items', [])
    metadata = data.get('metadata', {})
    metadata['total_items'] = len(items)
    metadata['categories'] = sorted(set(i.get('category', 'Uncategorized') for i in items))
    data['metadata'] = metadata
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
    except Exception:
        pass  # Silently skip if nothing to commit, git unavailable, or permission denied


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
        'expected_delivery': data.get('expected_delivery'),
        'status': data.get('status', 'BACKLOG'),
        'start_date': data.get('start_date'),
        'completed_date': data.get('completed_date'),
        'dependencies': data.get('dependencies', ''),
        'votes': [],
        'vote_count': 0,
        'comments': [],
        'n8n_workflows': data.get('n8n_workflows', []),
        'owner': data.get('owner', 'Zev'),
        'added_date': today_str(),
        'edit_history': [],
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
    if current_user.is_authenticated:
        return send_from_directory(app.static_folder, 'index.html')
    return send_from_directory(app.static_folder, 'landing.html')


@app.route('/landing')
def landing():
    return send_from_directory(app.static_folder, 'landing.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)


# --- Health ---

@app.route('/api/health')
def health():
    try:
        data = load_roadmap()
        item_count = len(data.get('items', []))
        return jsonify({'status': 'ok', 'items': item_count})
    except Exception:
        return jsonify({'status': 'error', 'error': 'Failed to load roadmap'}), 500


# --- Auth ---

@app.route('/api/auth/login', methods=['POST'])
def login():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'error': 'Request body required'}), 400
    username = body.get('username', '').strip()
    password = body.get('password', '')
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    user = authenticate(username, password)
    if user:
        login_user(user, remember=body.get('remember', False))
        return jsonify({
            'success': True,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'name': user.name,
                'role': user.role,
                'picture': user.picture,
            },
        })
    return jsonify({'error': 'Invalid credentials'}), 401


@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})


@app.route('/api/auth/me')
@login_required
def get_current_user():
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'email': current_user.email,
        'name': getattr(current_user, 'name', current_user.username),
        'role': current_user.role,
        'picture': getattr(current_user, 'picture', ''),
    })


# --- Google OAuth ---

@app.route('/auth/google')
def google_login():
    """Redirect to Google OAuth consent screen."""
    if not Config.GOOGLE_CLIENT_ID:
        return jsonify({'error': 'Google OAuth not configured'}), 500
    redirect_uri = url_for('google_callback', _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@app.route('/auth/google/callback')
def google_callback():
    """Handle Google OAuth callback."""
    try:
        token = oauth.google.authorize_access_token()
        user_info = token.get('userinfo')
        if not user_info:
            resp = oauth.google.get('https://openidconnect.googleapis.com/v1/userinfo')
            user_info = resp.json()

        email = user_info.get('email', '')
        name = user_info.get('name', email.split('@')[0])
        picture = user_info.get('picture', '')

        if not is_email_allowed(email):
            return render_template('error.html',
                title='Access Restricted',
                message='This dashboard is only available to DashQ team members.',
                detail=f'Your email: {email}',
                required='Required: @dashq.io email address',
                suggestion='Please sign in with your DashQ email address.',
            ), 403

        user = get_or_create_user(email, name, picture)
        login_user(user, remember=True)
        return redirect('/')

    except Exception as e:
        print(f"OAuth error: {e}")
        return render_template('error.html',
            title='Authentication Error',
            message='Failed to sign in with Google.',
            detail=str(e),
        ), 500


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


# --- API Key Auth ---

def require_api_key(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = Config.ROADMAP_API_KEY
        if not api_key:
            return jsonify({'error': 'API key not configured on server'}), 500
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing Authorization header. Use: Bearer <api-key>'}), 401
        token = auth_header[7:]
        if not hmac.compare_digest(token, api_key):
            return jsonify({'error': 'Invalid API key'}), 403
        return f(*args, **kwargs)
    return decorated


@app.route('/api/roadmap/items/create', methods=['POST'])
@require_api_key
def api_create_item():
    """Authenticated endpoint for external item creation (e.g. Claude Browser)."""
    body = request.get_json(silent=True)
    error = validate_item_input(body)
    if error:
        return jsonify({'error': error}), 400

    data = load_roadmap()
    new_id = next_id(data['items'])
    item = make_item(body, new_id)
    apply_status_dates(item, item['status'])

    # Add creation edit_history entry
    now_ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    item['edit_history'] = [{
        'timestamp': now_ts,
        'field': 'status',
        'old_value': None,
        'new_value': item['status'],
        'edited_by': body.get('_edited_by', 'API'),
    }]

    data['items'].append(item)
    save_roadmap(data)
    return jsonify({
        'success': True,
        'id': new_id,
        'name': item['name'],
        'status': item['status'],
        'url': f'https://cs.dashq.io',
    }), 201


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
    updated['comments'] = existing.get('comments', [])
    # Carry forward existing dates unless explicitly provided
    if 'start_date' not in body:
        updated['start_date'] = existing.get('start_date')
    if 'completed_date' not in body:
        updated['completed_date'] = existing.get('completed_date')
    if 'expected_delivery' not in body:
        updated['expected_delivery'] = existing.get('expected_delivery')
    apply_status_dates(updated, updated['status'])
    # Track edit history
    history = list(existing.get('edit_history', []))
    edited_by = body.get('_edited_by', 'Zev')
    now_ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    for field in TRACKED_FIELDS:
        old_val = existing.get(field)
        new_val = updated.get(field)
        if (old_val or None) != (new_val or None):
            history.append({
                'timestamp': now_ts,
                'field': field,
                'old_value': old_val,
                'new_value': new_val,
                'edited_by': edited_by,
            })
    updated['edit_history'] = history
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

    old_status = item['status']
    item['status'] = new_status
    apply_status_dates(item, new_status)
    # Track status change in edit history
    history = list(item.get('edit_history', []))
    if old_status != new_status:
        history.append({
            'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'field': 'status',
            'old_value': old_status,
            'new_value': new_status,
            'edited_by': body.get('_edited_by', 'Zev'),
        })
    item['edit_history'] = history
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


# --- Voting ---

@app.route('/api/roadmap/items/<int:item_id>/vote', methods=['POST'])
@login_required
def vote_item(item_id):
    """Vote on a roadmap item (upvote/downvote toggle)."""
    body = request.get_json(silent=True)
    vote_type = (body or {}).get('vote', 'up')
    if vote_type not in ('up', 'down'):
        return jsonify({'error': 'vote must be "up" or "down"'}), 400

    data = load_roadmap()
    idx, item = find_item(data['items'], item_id)
    if item is None:
        return jsonify({'error': f'Item {item_id} not found'}), 404

    votes = item.get('votes', [])
    user_vote = next((v for v in votes if v.get('user_id') == current_user.id), None)
    now_ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    if user_vote:
        if user_vote['vote'] == vote_type:
            # Un-vote (toggle off)
            votes = [v for v in votes if v.get('user_id') != current_user.id]
        else:
            # Change vote direction
            user_vote['vote'] = vote_type
    else:
        votes.append({
            'user_id': current_user.id,
            'username': current_user.username,
            'vote': vote_type,
            'timestamp': now_ts,
        })

    item['votes'] = votes
    item['vote_count'] = sum(1 if v['vote'] == 'up' else -1 for v in votes)

    # Track in edit history
    history = list(item.get('edit_history', []))
    history.append({
        'timestamp': now_ts,
        'field': 'votes',
        'old_value': None,
        'new_value': f'{current_user.username} voted {vote_type}',
        'edited_by': current_user.username,
    })
    item['edit_history'] = history
    data['items'][idx] = item
    save_roadmap(data)

    current_vote = next(
        (v['vote'] for v in item['votes'] if v.get('user_id') == current_user.id),
        None,
    )
    return jsonify({
        'success': True,
        'vote_count': item['vote_count'],
        'user_vote': current_vote,
    })


# --- Comments ---

@app.route('/api/roadmap/items/<int:item_id>/comments', methods=['GET'])
def get_comments(item_id):
    """Get comments for a roadmap item (public read)."""
    data = load_roadmap()
    _, item = find_item(data['items'], item_id)
    if item is None:
        return jsonify({'error': f'Item {item_id} not found'}), 404
    return jsonify({'comments': item.get('comments', [])})


@app.route('/api/roadmap/items/<int:item_id>/comments', methods=['POST'])
@login_required
def add_comment(item_id):
    """Add a comment to a roadmap item."""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'error': 'Request body required'}), 400
    comment_text = (body.get('comment') or '').strip()
    if not comment_text:
        return jsonify({'error': 'Comment text required'}), 400
    if len(comment_text) > 5000:
        return jsonify({'error': 'Comment too long (max 5000 chars)'}), 400

    data = load_roadmap()
    idx, item = find_item(data['items'], item_id)
    if item is None:
        return jsonify({'error': f'Item {item_id} not found'}), 404

    comments = item.get('comments', [])
    comment_id = max((c.get('id', 0) for c in comments), default=0) + 1
    now_ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    new_comment = {
        'id': comment_id,
        'user_id': current_user.id,
        'username': current_user.username,
        'comment': comment_text,
        'timestamp': now_ts,
        'replies': [],
    }
    comments.append(new_comment)
    item['comments'] = comments

    # Track in edit history
    history = list(item.get('edit_history', []))
    history.append({
        'timestamp': now_ts,
        'field': 'comments',
        'old_value': None,
        'new_value': f'{current_user.username} added comment',
        'edited_by': current_user.username,
    })
    item['edit_history'] = history
    data['items'][idx] = item
    save_roadmap(data)

    return jsonify({'success': True, 'comment': new_comment}), 201


@app.route('/api/roadmap/items/<int:item_id>/comments/<int:comment_id>', methods=['PUT', 'DELETE'])
@login_required
def manage_comment(item_id, comment_id):
    """Edit or delete a comment."""
    data = load_roadmap()
    idx, item = find_item(data['items'], item_id)
    if item is None:
        return jsonify({'error': f'Item {item_id} not found'}), 404

    comments = item.get('comments', [])
    comment = next((c for c in comments if c.get('id') == comment_id), None)
    if comment is None:
        return jsonify({'error': f'Comment {comment_id} not found'}), 404

    # Only comment owner or admin can edit/delete
    if comment.get('user_id') != current_user.id and current_user.role != 'admin':
        return jsonify({'error': 'Permission denied'}), 403

    now_ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    if request.method == 'PUT':
        body = request.get_json(silent=True)
        new_text = (body or {}).get('comment', '').strip()
        if not new_text:
            return jsonify({'error': 'Comment text required'}), 400
        if len(new_text) > 5000:
            return jsonify({'error': 'Comment too long (max 5000 chars)'}), 400
        comment['comment'] = new_text
        comment['edited'] = True
        comment['edited_at'] = now_ts
        data['items'][idx] = item
        save_roadmap(data)
        return jsonify({'success': True, 'comment': comment})

    # DELETE
    item['comments'] = [c for c in comments if c.get('id') != comment_id]
    data['items'][idx] = item
    save_roadmap(data)
    return jsonify({'success': True})


# --- Error handlers (always return JSON for API clients) ---

from werkzeug.exceptions import HTTPException
import re as _re


def _fire_error_webhook(status_code, error_msg, tb_str=''):
    """Send error details to the self-healing AI agent via n8n webhook."""
    if not Config.ERROR_WEBHOOK_URL:
        return
    try:
        import urllib.request
        ref = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
        endpoint = request.path if request else 'unknown'
        method = request.method if request else 'unknown'

        # Extract source files from traceback (project files only)
        source_frames = []
        for match in _re.finditer(r'File "([^"]+)", line (\d+)', tb_str):
            filepath, lineno = match.group(1), int(match.group(2))
            if 'site-packages' not in filepath and 'lib/python' not in filepath:
                source_frames.append({'file': filepath, 'line': lineno})

        payload = json.dumps({
            'ref': ref,
            'status_code': status_code,
            'error': error_msg[:500],
            'traceback': tb_str[:3000],
            'endpoint': f'{method} {endpoint}',
            'source_frames': source_frames[-5:],
            'timestamp': datetime.now(timezone.utc).isoformat(),
        })
        req = urllib.request.Request(
            Config.ERROR_WEBHOOK_URL,
            data=payload.encode(),
            headers={'Content-Type': 'application/json'},
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # Never let webhook failure break the error response


@app.errorhandler(HTTPException)
def handle_http_error(e):
    if e.code and e.code >= 400:
        _fire_error_webhook(e.code, e.description or e.name)
        ref = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
        endpoint = request.path if request else 'unknown'
        method = request.method if request else 'unknown'
        return jsonify({
            'error': e.description or e.name,
            'ref': ref,
            'endpoint': f'{method} {endpoint}',
        }), e.code
    return e


@app.errorhandler(500)
def server_error(e):
    import traceback
    tb_str = traceback.format_exc()
    traceback.print_exc()
    ref = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    endpoint = request.path if request else 'unknown'
    method = request.method if request else 'unknown'
    detail = str(getattr(e, 'original_exception', e) or 'Unknown error')

    _fire_error_webhook(500, detail, tb_str)

    if len(detail) > 200:
        detail = detail[:200] + '...'
    return jsonify({
        'error': 'Internal server error',
        'detail': detail,
        'ref': ref,
        'endpoint': f'{method} {endpoint}',
    }), 500


if __name__ == '__main__':
    app.run(debug=Config.DEBUG, host='0.0.0.0', port=Config.PORT)
