"""Auth, voting, and comments tests — Phase 3A team collaboration features."""

import json


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

class TestAuth:
    """Prevent: Auth endpoints broken, login/logout failing."""

    def test_login_success(self, client):
        resp = client.post('/api/auth/login', json={
            'username': 'admin',
            'password': 'admin',
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['user']['username'] == 'admin'
        assert data['user']['role'] == 'admin'

    def test_login_wrong_password(self, client):
        resp = client.post('/api/auth/login', json={
            'username': 'admin',
            'password': 'wrong',
        })
        assert resp.status_code == 401

    def test_login_unknown_user(self, client):
        resp = client.post('/api/auth/login', json={
            'username': 'nobody',
            'password': 'admin',
        })
        assert resp.status_code == 401

    def test_login_missing_fields(self, client):
        resp = client.post('/api/auth/login', json={})
        assert resp.status_code == 400

    def test_login_empty_body(self, client):
        resp = client.post('/api/auth/login',
                           data='not json',
                           content_type='text/plain')
        assert resp.status_code == 400

    def test_me_requires_auth(self, client):
        resp = client.get('/api/auth/me')
        assert resp.status_code == 401

    def test_me_returns_user(self, logged_in_client):
        resp = logged_in_client.get('/api/auth/me')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['username'] == 'admin'
        assert data['role'] == 'admin'

    def test_logout(self, logged_in_client):
        resp = logged_in_client.post('/api/auth/logout')
        assert resp.status_code == 200
        # After logout, /me should fail
        resp2 = logged_in_client.get('/api/auth/me')
        assert resp2.status_code == 401

    def test_logout_requires_auth(self, client):
        resp = client.post('/api/auth/logout')
        assert resp.status_code == 401

    def test_unauthorized_returns_json(self, client):
        """Verify 401 returns JSON, not HTML redirect."""
        resp = client.get('/api/auth/me')
        assert resp.status_code == 401
        data = resp.get_json()
        assert 'error' in data


# ---------------------------------------------------------------------------
# Voting
# ---------------------------------------------------------------------------

class TestVoting:
    """Prevent: Voting endpoints broken, wrong counts, auth bypass."""

    def test_vote_requires_auth(self, client):
        resp = client.post('/api/roadmap/items/1/vote',
                           json={'vote': 'up'})
        assert resp.status_code == 401

    def test_upvote(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/1/vote',
                                     json={'vote': 'up'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['vote_count'] == 1
        assert data['user_vote'] == 'up'

    def test_downvote(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/1/vote',
                                     json={'vote': 'down'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['vote_count'] == -1
        assert data['user_vote'] == 'down'

    def test_toggle_vote_off(self, logged_in_client):
        """Voting same direction twice removes the vote."""
        logged_in_client.post('/api/roadmap/items/1/vote',
                              json={'vote': 'up'})
        resp = logged_in_client.post('/api/roadmap/items/1/vote',
                                     json={'vote': 'up'})
        data = resp.get_json()
        assert data['vote_count'] == 0
        assert data['user_vote'] is None

    def test_change_vote_direction(self, logged_in_client):
        """Voting opposite direction changes the vote."""
        logged_in_client.post('/api/roadmap/items/1/vote',
                              json={'vote': 'up'})
        resp = logged_in_client.post('/api/roadmap/items/1/vote',
                                     json={'vote': 'down'})
        data = resp.get_json()
        assert data['vote_count'] == -1
        assert data['user_vote'] == 'down'

    def test_invalid_vote_type(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/1/vote',
                                     json={'vote': 'invalid'})
        assert resp.status_code == 400

    def test_vote_nonexistent_item(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/99999/vote',
                                     json={'vote': 'up'})
        assert resp.status_code == 404

    def test_vote_tracked_in_history(self, logged_in_client):
        logged_in_client.post('/api/roadmap/items/1/vote',
                              json={'vote': 'up'})
        resp = logged_in_client.get('/api/roadmap/items/1')
        item = resp.get_json()
        vote_entries = [h for h in item['edit_history'] if h['field'] == 'votes']
        assert len(vote_entries) > 0

    def test_vote_default_is_up(self, logged_in_client):
        """Omitting vote type defaults to 'up'."""
        resp = logged_in_client.post('/api/roadmap/items/1/vote',
                                     json={})
        data = resp.get_json()
        assert data['user_vote'] == 'up'
        assert data['vote_count'] == 1


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

class TestComments:
    """Prevent: Comment endpoints broken, permission bypass."""

    def test_get_comments_public(self, client):
        """GET comments is public (no auth required)."""
        resp = client.get('/api/roadmap/items/1/comments')
        assert resp.status_code == 200
        assert 'comments' in resp.get_json()

    def test_add_comment_requires_auth(self, client):
        resp = client.post('/api/roadmap/items/1/comments',
                           json={'comment': 'Hello'})
        assert resp.status_code == 401

    def test_add_comment(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/1/comments',
                                     json={'comment': 'Test comment'})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['success'] is True
        assert data['comment']['comment'] == 'Test comment'
        assert data['comment']['username'] == 'admin'
        assert 'id' in data['comment']

    def test_add_empty_comment(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/1/comments',
                                     json={'comment': ''})
        assert resp.status_code == 400

    def test_add_comment_too_long(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/1/comments',
                                     json={'comment': 'x' * 5001})
        assert resp.status_code == 400

    def test_add_comment_no_body(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/1/comments',
                                     data='not json',
                                     content_type='text/plain')
        assert resp.status_code == 400

    def test_comment_on_nonexistent_item(self, logged_in_client):
        resp = logged_in_client.post('/api/roadmap/items/99999/comments',
                                     json={'comment': 'Test'})
        assert resp.status_code == 404

    def test_get_comments_after_add(self, logged_in_client):
        logged_in_client.post('/api/roadmap/items/1/comments',
                              json={'comment': 'First comment'})
        resp = logged_in_client.get('/api/roadmap/items/1/comments')
        comments = resp.get_json()['comments']
        assert len(comments) == 1
        assert comments[0]['comment'] == 'First comment'

    def test_edit_own_comment(self, logged_in_client):
        # Create a comment
        resp = logged_in_client.post('/api/roadmap/items/1/comments',
                                     json={'comment': 'Original'})
        comment_id = resp.get_json()['comment']['id']
        # Edit it
        resp2 = logged_in_client.put(
            f'/api/roadmap/items/1/comments/{comment_id}',
            json={'comment': 'Edited'},
        )
        assert resp2.status_code == 200
        assert resp2.get_json()['comment']['comment'] == 'Edited'
        assert resp2.get_json()['comment']['edited'] is True

    def test_delete_own_comment(self, logged_in_client):
        # Create a comment
        resp = logged_in_client.post('/api/roadmap/items/1/comments',
                                     json={'comment': 'To delete'})
        comment_id = resp.get_json()['comment']['id']
        # Delete it
        resp2 = logged_in_client.delete(
            f'/api/roadmap/items/1/comments/{comment_id}',
        )
        assert resp2.status_code == 200
        # Verify it's gone
        resp3 = logged_in_client.get('/api/roadmap/items/1/comments')
        assert len(resp3.get_json()['comments']) == 0

    def test_delete_nonexistent_comment(self, logged_in_client):
        resp = logged_in_client.delete('/api/roadmap/items/1/comments/99999')
        assert resp.status_code == 404

    def test_comment_tracked_in_history(self, logged_in_client):
        logged_in_client.post('/api/roadmap/items/1/comments',
                              json={'comment': 'History test'})
        resp = logged_in_client.get('/api/roadmap/items/1')
        item = resp.get_json()
        comment_entries = [h for h in item['edit_history'] if h['field'] == 'comments']
        assert len(comment_entries) > 0

    def test_comments_preserved_on_item_update(self, logged_in_client):
        """Comments survive a full item PUT update."""
        logged_in_client.post('/api/roadmap/items/1/comments',
                              json={'comment': 'Should survive'})
        # Full update the item
        logged_in_client.put('/api/roadmap/items/1',
                             json={'name': 'Updated Name', 'status': 'PLANNED'})
        # Comments should still be there
        resp = logged_in_client.get('/api/roadmap/items/1/comments')
        comments = resp.get_json()['comments']
        assert len(comments) == 1
        assert comments[0]['comment'] == 'Should survive'
