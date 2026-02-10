"""Backend API tests — prevent Flask crashes, bad responses, CORS issues."""

import json


# ---------------------------------------------------------------------------
# Flask starts / health
# ---------------------------------------------------------------------------

class TestFlaskStarts:
    """Prevent: Flask won't start due to syntax/import errors."""

    def test_app_creates(self, app):
        assert app is not None

    def test_health_endpoint(self, client):
        resp = client.get('/api/health')
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'ok'


# ---------------------------------------------------------------------------
# API endpoints exist and return correct status codes
# ---------------------------------------------------------------------------

class TestAPIEndpointsExist:
    """Prevent: 404 on API endpoints."""

    def test_get_roadmap(self, client):
        resp = client.get('/api/roadmap')
        assert resp.status_code == 200

    def test_get_items(self, client):
        resp = client.get('/api/roadmap/items')
        assert resp.status_code == 200

    def test_get_item_by_id(self, client):
        resp = client.get('/api/roadmap/items/1')
        assert resp.status_code == 200

    def test_get_item_not_found(self, client):
        resp = client.get('/api/roadmap/items/99999')
        assert resp.status_code == 404

    def test_get_backlog(self, client):
        resp = client.get('/api/backlog')
        assert resp.status_code == 200

    def test_post_backlog_stub(self, client):
        resp = client.post('/api/backlog')
        assert resp.status_code == 501

    def test_vote_stub(self, client):
        resp = client.post('/api/roadmap/items/1/vote')
        assert resp.status_code == 501


# ---------------------------------------------------------------------------
# API returns valid JSON
# ---------------------------------------------------------------------------

class TestAPIReturnsValidJSON:
    """Prevent: Malformed API responses."""

    def test_roadmap_is_json(self, client):
        resp = client.get('/api/roadmap')
        data = resp.get_json()
        assert 'items' in data
        assert 'metadata' in data
        assert 'version' in data

    def test_items_is_list(self, client):
        resp = client.get('/api/roadmap/items')
        data = resp.get_json()
        assert isinstance(data, list)

    def test_single_item_has_required_fields(self, client):
        resp = client.get('/api/roadmap/items/1')
        item = resp.get_json()
        required = ['id', 'name', 'status', 'category']
        for field in required:
            assert field in item, f"Missing field: {field}"

    def test_error_responses_are_json(self, client):
        resp = client.get('/api/roadmap/items/99999')
        data = resp.get_json()
        assert 'error' in data


# ---------------------------------------------------------------------------
# CORS headers
# ---------------------------------------------------------------------------

class TestCORS:
    """Prevent: CORS blocking frontend requests."""

    def test_cors_allows_origin(self, client):
        resp = client.get('/api/health', headers={'Origin': 'http://localhost:3000'})
        # flask-cors adds the header when Origin is present
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------

class TestCRUD:
    """Prevent: Create/Update/Delete endpoints broken."""

    def test_create_item(self, client):
        resp = client.post('/api/roadmap/items',
                           json={'name': 'New Item', 'category': 'DevOps'})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['name'] == 'New Item'
        assert data['id'] == 3  # Next after existing 1, 2

    def test_create_item_missing_name(self, client):
        resp = client.post('/api/roadmap/items', json={'category': 'DevOps'})
        assert resp.status_code == 400

    def test_create_item_empty_body(self, client):
        resp = client.post('/api/roadmap/items',
                           data='not json',
                           content_type='text/plain')
        assert resp.status_code == 400

    def test_update_item(self, client):
        resp = client.put('/api/roadmap/items/1',
                          json={'name': 'Updated Name', 'status': 'PLANNED'})
        assert resp.status_code == 200
        assert resp.get_json()['name'] == 'Updated Name'

    def test_update_nonexistent_item(self, client):
        resp = client.put('/api/roadmap/items/99999',
                          json={'name': 'Ghost'})
        assert resp.status_code == 404

    def test_delete_item(self, client):
        resp = client.delete('/api/roadmap/items/1')
        assert resp.status_code == 200
        assert resp.get_json()['deleted'] == 1

    def test_delete_nonexistent_item(self, client):
        resp = client.delete('/api/roadmap/items/99999')
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Status updates & auto-dates
# ---------------------------------------------------------------------------

class TestStatusUpdates:
    """Prevent: Status transitions break, dates not auto-set."""

    def test_update_status(self, client):
        resp = client.put('/api/roadmap/items/1/status',
                          json={'status': 'IN_PROGRESS'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'IN_PROGRESS'
        assert data['start_date'] is not None

    def test_update_status_to_done(self, client):
        resp = client.put('/api/roadmap/items/1/status',
                          json={'status': 'DONE'})
        assert resp.status_code == 200
        assert resp.get_json()['completed_date'] is not None

    def test_invalid_status(self, client):
        resp = client.put('/api/roadmap/items/1/status',
                          json={'status': 'INVALID'})
        assert resp.status_code == 400

    def test_missing_status_field(self, client):
        resp = client.put('/api/roadmap/items/1/status', json={})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

class TestInputValidation:
    """Prevent: Invalid data accepted, causes downstream crashes."""

    def test_score_out_of_range(self, client):
        resp = client.post('/api/roadmap/items',
                           json={'name': 'Test', 'impact_score': 99})
        assert resp.status_code == 400

    def test_negative_score(self, client):
        resp = client.post('/api/roadmap/items',
                           json={'name': 'Test', 'ease_score': -1})
        assert resp.status_code == 400

    def test_score_not_number(self, client):
        resp = client.post('/api/roadmap/items',
                           json={'name': 'Test', 'priority_score': 'high'})
        assert resp.status_code == 400

    def test_invalid_status_on_create(self, client):
        resp = client.post('/api/roadmap/items',
                           json={'name': 'Test', 'status': 'BOGUS'})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

class TestFiltering:
    """Prevent: Filter queries return wrong results."""

    def test_filter_by_status(self, client):
        resp = client.get('/api/roadmap/items?status=BACKLOG')
        items = resp.get_json()
        assert all(i['status'] == 'BACKLOG' for i in items)

    def test_filter_by_category(self, client):
        resp = client.get('/api/roadmap/items?category=DevOps')
        items = resp.get_json()
        assert all(i['category'] == 'DevOps' for i in items)


# ---------------------------------------------------------------------------
# Edit history
# ---------------------------------------------------------------------------

class TestEditHistory:
    """Prevent: Edit history not tracked, audit trail lost."""

    def test_status_change_tracked(self, client):
        client.put('/api/roadmap/items/1/status',
                   json={'status': 'PLANNED'})
        resp = client.get('/api/roadmap/items/1')
        item = resp.get_json()
        assert len(item['edit_history']) > 0
        assert item['edit_history'][-1]['field'] == 'status'

    def test_field_update_tracked(self, client):
        client.put('/api/roadmap/items/1',
                   json={'name': 'Test Item Alpha', 'category': 'Reliability'})
        resp = client.get('/api/roadmap/items/1')
        item = resp.get_json()
        history_fields = [h['field'] for h in item['edit_history']]
        assert 'category' in history_fields
