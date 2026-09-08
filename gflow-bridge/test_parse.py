import json
import unittest

from server import _gflow_fail_message, _parse_gflow_json, _sanitize_prompt


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


class PromptTests(unittest.TestCase):
    def test_strips_at_mentions(self):
        self.assertEqual(_sanitize_prompt("pan left @Hero and @Name:x"), "pan left  and")

    def test_fail_message_joins_class_and_detail(self):
        msg = _gflow_fail_message(
            {"error": {"class": "FlowHostMigratedError", "detail": "handed off", "remediation_hint": "use I2V"}},
            "",
            "",
            36,
        )
        self.assertIn("FlowHostMigratedError", msg)
        self.assertIn("handed off", msg)


class DrainTests(unittest.TestCase):
    def test_read_body_helper_exists(self):
        from server import Handler, MAX_BODY

        self.assertTrue(hasattr(Handler, "_read_body"))
        self.assertGreater(MAX_BODY, 1024)


if __name__ == "__main__":
    unittest.main()
