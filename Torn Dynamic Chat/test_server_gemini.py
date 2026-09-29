"""Run with: python3 -B -m unittest test_server_gemini.py"""

import http.client
import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from server_gemini import Handler


class MockResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, *_):
        return b'{"candidates":[{"content":{"parts":[{"text":"sounds good :)"}]}}]}'


class GeminiProxyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, token, payload):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        conn.request("POST", "/generate", json.dumps(payload),
                     {"Content-Type": "application/json", "X-Chat-Token": token})
        response = conn.getresponse()
        result = response.status, json.loads(response.read())
        conn.close()
        return result

    def test_auth_validation_and_gemini_request(self):
        payload = {"context": "Hey, are you free?", "chat": "Sam", "samples": ["yeah sure"]}
        with patch.dict(os.environ, {"CHAT_ACCESS_TOKEN": "test-token", "GEMINI_API_KEY": "test-key"}), \
                patch("server_gemini.urllib.request.urlopen", return_value=MockResponse()) as upstream:
            self.assertEqual(self.request("wrong-token", payload)[0], 401)
            self.assertEqual(self.request("test-token", {"context": "", "samples": []})[0], 400)
            status, result = self.request("test-token", payload)
            self.assertEqual((status, result["draft"]), (200, "sounds good :)"))
            sent = upstream.call_args.args[0]
            self.assertEqual(sent.headers["X-goog-api-key"], "test-key")
            self.assertIn("yeah sure", sent.data.decode())


if __name__ == "__main__":
    unittest.main()
