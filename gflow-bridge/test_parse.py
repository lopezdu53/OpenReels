import json
import unittest

from server import (
    I2V_FALLBACK_T2V,
    _gflow_fail_message,
    _parse_gflow_json,
    _resolve_video_mode,
    _sanitize_prompt,
    _should_fallback_t2v,
    _video_cli_args,
)


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


class VideoModeTests(unittest.TestCase):
    def test_defaults_to_t2v(self):
        self.assertEqual(_resolve_video_mode(None), "t2v")
        self.assertEqual(_resolve_video_mode("nope"), "t2v")
        self.assertEqual(_resolve_video_mode("i2v"), "i2v")

    def test_t2v_args_omit_initial_frame(self):
        args = _video_cli_args(
            mode="t2v",
            prompt="a cat walks",
            model="veo-lite",
            duration=6,
            aspect="16:9",
            dest="out.mp4",
            still_path=None,
        )
        self.assertEqual(args[:3], ["video", "t2v", "a cat walks"])
        self.assertNotIn("--initial-frame", args)
        self.assertNotIn("--duration", args)

    def test_veo_omits_duration_even_if_requested(self):
        args = _video_cli_args(
            mode="t2v",
            prompt="pan",
            model="veo-lite",
            duration=4,
            aspect="16:9",
            dest="out.mp4",
            still_path=None,
        )
        self.assertNotIn("--duration", args)

    def test_omni_flash_keeps_duration(self):
        args = _video_cli_args(
            mode="t2v",
            prompt="pan",
            model="omni-flash",
            duration=10,
            aspect="16:9",
            dest="out.mp4",
            still_path=None,
        )
        self.assertIn("--duration", args)
        self.assertIn("10", args)

    def test_i2v_args_need_still(self):
        args = _video_cli_args(
            mode="i2v",
            prompt="pan left",
            model="veo-lite",
            duration=6,
            aspect="16:9",
            dest="out.mp4",
            still_path="C:/tmp/still.png",
        )
        self.assertEqual(args[:4], ["video", "i2v", "--initial-frame", "C:/tmp/still.png"])
        self.assertNotIn("--duration", args)

    def test_picker_error_falls_back_to_t2v(self):
        self.assertTrue(
            _should_fallback_t2v(
                "UiSelectorDriftError — the frame picker stayed open 15s after picking 'still.png'"
            )
        )
        self.assertTrue(_should_fallback_t2v("no maseQ reply within 60s"))
        self.assertFalse(_should_fallback_t2v("Token inválido"))
        self.assertFalse(I2V_FALLBACK_T2V)


class DrainTests(unittest.TestCase):
    def test_read_body_helper_exists(self):
        from server import Handler, MAX_BODY

        self.assertTrue(hasattr(Handler, "_read_body"))
        self.assertGreater(MAX_BODY, 1024)


if __name__ == "__main__":
    unittest.main()
