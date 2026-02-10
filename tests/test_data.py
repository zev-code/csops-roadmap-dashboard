"""Data integrity tests — prevent malformed JSON, duplicate IDs, bad values."""

import json
import os

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ROADMAP_FILE = os.path.join(PROJECT_ROOT, 'data', 'roadmap.json')
VALID_STATUSES = {'BACKLOG', 'PLANNED', 'NEXT', 'IN_PROGRESS', 'DONE'}


@pytest.fixture()
def data():
    with open(ROADMAP_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# JSON validity
# ---------------------------------------------------------------------------

class TestJSONValidity:
    """Prevent: Malformed JSON crashes the entire app."""

    def test_roadmap_json_is_valid(self):
        """File must parse without errors."""
        with open(ROADMAP_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        assert isinstance(data, dict)

    def test_has_required_top_level_keys(self, data):
        for key in ['version', 'items', 'metadata', 'last_updated']:
            assert key in data, f"Missing top-level key: {key}"

    def test_items_is_list(self, data):
        assert isinstance(data['items'], list)

    def test_metadata_structure(self, data):
        meta = data['metadata']
        assert 'total_items' in meta
        assert 'categories' in meta
        assert 'statuses' in meta


# ---------------------------------------------------------------------------
# No duplicate IDs
# ---------------------------------------------------------------------------

class TestNoDuplicateIDs:
    """Prevent: Duplicate IDs break drag-drop and item lookup."""

    def test_no_duplicate_ids(self, data):
        ids = [item['id'] for item in data['items']]
        duplicates = [x for x in ids if ids.count(x) > 1]
        assert len(duplicates) == 0, f"Duplicate IDs found: {set(duplicates)}"

    def test_all_ids_are_integers(self, data):
        for item in data['items']:
            assert isinstance(item['id'], int), f"Non-integer ID: {item['id']}"

    def test_all_ids_are_positive(self, data):
        for item in data['items']:
            assert item['id'] > 0, f"Non-positive ID: {item['id']}"


# ---------------------------------------------------------------------------
# Required fields
# ---------------------------------------------------------------------------

class TestRequiredFields:
    """Prevent: Missing fields cause crashes in frontend or backend."""

    REQUIRED_ITEM_FIELDS = [
        'id', 'name', 'status', 'category', 'description',
        'impact_score', 'ease_score', 'priority_score',
        'owner', 'added_date',
    ]

    def test_all_items_have_required_fields(self, data):
        for item in data['items']:
            for field in self.REQUIRED_ITEM_FIELDS:
                assert field in item, (
                    f"Item {item.get('id', '?')} missing field: {field}"
                )

    def test_no_empty_names(self, data):
        for item in data['items']:
            assert item['name'].strip(), f"Item {item['id']} has empty name"


# ---------------------------------------------------------------------------
# Valid status values
# ---------------------------------------------------------------------------

class TestValidStatuses:
    """Prevent: Invalid status breaks kanban column rendering."""

    def test_all_statuses_valid(self, data):
        for item in data['items']:
            assert item['status'] in VALID_STATUSES, (
                f"Item {item['id']} has invalid status: {item['status']}"
            )

    def test_metadata_statuses_match(self, data):
        meta_statuses = set(data['metadata']['statuses'])
        assert meta_statuses == VALID_STATUSES


# ---------------------------------------------------------------------------
# Valid scores / priorities
# ---------------------------------------------------------------------------

class TestValidScores:
    """Prevent: Score out of range causes UI bugs."""

    SCORE_FIELDS = ['impact_score', 'ease_score', 'priority_score']

    def test_scores_in_range(self, data):
        for item in data['items']:
            for field in self.SCORE_FIELDS:
                val = item[field]
                assert isinstance(val, (int, float)), (
                    f"Item {item['id']} {field} is not numeric: {val}"
                )
                assert 0 <= val <= 10, (
                    f"Item {item['id']} {field}={val} out of 0-10 range"
                )


# ---------------------------------------------------------------------------
# Valid dates
# ---------------------------------------------------------------------------

class TestValidDates:
    """Prevent: Invalid date formats break date parsing."""

    def test_added_date_present(self, data):
        for item in data['items']:
            assert item.get('added_date'), (
                f"Item {item['id']} missing added_date"
            )

    def test_expected_delivery_format(self, data):
        """If expected_delivery is set, it should be a date string or null."""
        import re
        date_pattern = re.compile(r'^\d{4}-\d{2}-\d{2}$')
        for item in data['items']:
            val = item.get('expected_delivery')
            if val is not None:
                assert date_pattern.match(str(val)), (
                    f"Item {item['id']} expected_delivery bad format: {val}"
                )


# ---------------------------------------------------------------------------
# Metadata consistency
# ---------------------------------------------------------------------------

class TestMetadataConsistency:
    """Prevent: Metadata out of sync with actual data."""

    def test_total_items_matches(self, data):
        assert data['metadata']['total_items'] == len(data['items'])

    def test_categories_match(self, data):
        actual = sorted(set(i['category'] for i in data['items']))
        assert data['metadata']['categories'] == actual, (
            f"Metadata categories mismatch.\n"
            f"  Metadata: {data['metadata']['categories']}\n"
            f"  Actual:   {actual}"
        )
