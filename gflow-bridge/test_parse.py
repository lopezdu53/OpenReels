import json
import unittest

from server import _parse_gflow_json


class ParseTests(unittest.TestCase):
    def test_image_payload(self):
        payload = _parse_gflow_json(
            'noise\n{"status":"ok","images":[{"local_path":"C:/tmp/hero.png"}]}\n'
        )
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["images"][0]["local_path"], "C:/tmp/hero.png")

    def test_missing_json(self):
        with self.assertRaises(RuntimeError):
            _parse_gflow_json("no json here")


if __name__ == "__main__":
    unittest.main()
