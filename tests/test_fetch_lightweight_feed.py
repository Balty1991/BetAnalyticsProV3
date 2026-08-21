import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import fetch_lightweight_feed


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"results": [{"id": 7, "event": {"id": 70}}]}


class LightweightFeedTests(unittest.TestCase):
    def setUp(self):
        self.token = os.environ.get("BSD_TOKEN")
        os.environ["BSD_TOKEN"] = "test-token"
        self.now = datetime(2026, 8, 22, 5, 20, tzinfo=timezone.utc)

    def tearDown(self):
        if self.token is None:
            os.environ.pop("BSD_TOKEN", None)
        else:
            os.environ["BSD_TOKEN"] = self.token

    @patch("fetch_lightweight_feed.requests.get", return_value=FakeResponse())
    def test_limits_daily_requests_to_two(self, request_get):
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            first = fetch_lightweight_feed.refresh(data_dir, self.now)
            second = fetch_lightweight_feed.refresh(data_dir, self.now)
            third = fetch_lightweight_feed.refresh(data_dir, self.now)

            self.assertEqual(first["status"], "success")
            self.assertEqual(second["status"], "success")
            self.assertEqual(third["status"], "skipped_budget_exhausted")
            self.assertEqual(request_get.call_count, 2)

            tracker = json.loads((data_dir / "api_request_budget.json").read_text(encoding="utf-8"))
            self.assertEqual(tracker["requestsUsed"], 2)
            self.assertEqual(len(json.loads((data_dir / "predictions.json").read_text(encoding="utf-8"))), 1)
