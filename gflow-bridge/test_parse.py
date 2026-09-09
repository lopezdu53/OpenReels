import json
import unittest

from server import (
    I2V_FALLBACK_T2V,
    STILL_PREFIX,
    _catalog_paths_from_list,
    _flow_picker_script,
    _mp4_search_roots,
    _gflow_fail_message,
    _is_add_to_prompt_label,
    _is_submit_miss,
    _parse_gflow_json,
    _resolve_video_mode,
    _sanitize_prompt,
    _should_fallback_t2v,
    _unique_still_name,
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
        self.assertTrue(
            _should_fallback_t2v(
                "migrated host: the frame picker stayed open 15s after picking 'or-i2v-1-aa.png'"
            )
        )
        self.assertTrue(_should_fallback_t2v("no maseQ reply within 60s"))
        self.assertFalse(_should_fallback_t2v("Token inválido"))
        self.assertFalse(I2V_FALLBACK_T2V)

    def test_unique_still_name(self):
        a = _unique_still_name()
        b = _unique_still_name()
        self.assertTrue(a.startswith(STILL_PREFIX) and a.endswith(".png"))
        self.assertNotEqual(a, b)

    def test_add_to_prompt_labels(self):
        self.assertTrue(_is_add_to_prompt_label("Add to prompt"))
        self.assertTrue(_is_add_to_prompt_label("Añadir al prompt"))
        self.assertFalse(_is_add_to_prompt_label("Create"))
        script = _flow_picker_script("click", "or-i2v-demo.png")
        self.assertIn("add to prompt", script)
        self.assertIn("or-i2v-demo.png", script)
        self.assertIn("$action = 'click'", script)

    def test_submit_miss_is_not_picker_retry(self):
        miss = (
            "TransportTimeoutError — migrated host: no YhhmEf/eb1hJf/MZZA6b "
            "reply within 60s of clicking submit"
        )
        self.assertTrue(_is_submit_miss(miss))
        self.assertFalse(_should_fallback_t2v(miss))
        self.assertFalse(
            _is_submit_miss(
                "UiSelectorDriftError — migrated host: the frame picker stayed open 15s"
            )
        )

    def test_catalog_paths_from_list(self):
        import os
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            mp4 = Path(tmp) / "clip.mp4"
            mp4.write_bytes(b"0" * 100)
            rows = json.dumps([{"local_path": str(mp4), "media_id": "abc"}])
            found = _catalog_paths_from_list(rows)
            self.assertEqual(found, [mp4])
            self.assertEqual(_mp4_search_roots(mp4), [mp4.parent])
            os.unlink(mp4)


class DrainTests(unittest.TestCase):
    def test_read_body_helper_exists(self):
        from server import Handler, MAX_BODY

        self.assertTrue(hasattr(Handler, "_read_body"))
        self.assertGreater(MAX_BODY, 1024)


class SettingsTests(unittest.TestCase):
    def test_apply_settings_sets_token_and_allow_list(self):
        import server

        server.apply_settings(token="abc", allow_ips="192.168.1.71, 10.0.0.2", project="p1", project_name="OpenReels")
        self.assertEqual(server.TOKEN, "abc")
        self.assertEqual(server.ALLOW_IPS, {"192.168.1.71", "10.0.0.2"})

    def test_apply_settings_sets_gflow_profile(self):
        import server

        server.apply_settings(
            token="abc",
            project="p1",
            project_name="OpenReels",
            profile="gemini",
            gflow_bin="/tmp/does-not-exist-gflow",
        )
        self.assertEqual(server.PROFILE, "gemini")
        self.assertEqual(server.GFLOW_BIN, "/tmp/does-not-exist-gflow")


class RelayClientTests(unittest.TestCase):
    def test_headers_look_like_chrome_not_python(self):
        from relay_client import BROWSER_UA, _headers

        headers = _headers("secret", "https://contenido.alfonsolopezd.com")
        self.assertIn("Chrome/", headers["User-Agent"])
        self.assertNotIn("Python", headers["User-Agent"])
        self.assertEqual(headers["User-Agent"], BROWSER_UA)
        self.assertTrue(headers["Authorization"].startswith("Bearer secret"))
        self.assertEqual(headers["Origin"], "https://contenido.alfonsolopezd.com")

    def test_cloudflare_1010_message(self):
        from relay_client import format_remote_http_error

        msg = format_remote_http_error(
            403,
            '{"type":"https://developers.cloudflare.com/.../error-1010/","title":"Error 1010: Access denied"}',
        )
        self.assertIn("Cloudflare 1010", msg)
        self.assertNotIn("Python-urllib", msg)

    def test_missing_relay_routes_message(self):
        from relay_client import format_remote_http_error

        msg = format_remote_http_error(404, '{"error":"Not found"}')
        self.assertIn("EasyPanel", msg)
        self.assertIn("video-worker", msg)


class ChromeProfileTests(unittest.TestCase):
    def test_reads_gmail_from_local_state(self):
        import tempfile
        from pathlib import Path

        from profiles import gflow_login_cmd, list_chrome_profiles, missing_gflow_message

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Local State").write_text(
                json.dumps(
                    {
                        "profile": {
                            "info_cache": {
                                "Default": {"name": "Personal", "user_name": "yo@gmail.com"},
                                "Profile 3": {"name": "Gemini", "user_name": "plan@gmail.com"},
                                "System Profile": {"name": "System", "user_name": "x"},
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )
            rows = list_chrome_profiles(root)
            dirs = {row["directory"] for row in rows}
            self.assertIn("Default", dirs)
            self.assertIn("Profile 3", dirs)
            self.assertNotIn("System Profile", dirs)
            gemini = next(row for row in rows if row["directory"] == "Profile 3")
            self.assertIn("plan@gmail.com", gemini["label"])

        cmd = gflow_login_cmd(r"C:\Tools\gflow.exe", "gemini")
        self.assertEqual(cmd[:4], [r"C:\Tools\gflow.exe", "auth", "login", "--browser"])
        self.assertIn("chrome", cmd)
        self.assertIn("--profile", cmd)
        self.assertIn("gemini", cmd)
        self.assertIn("gflow-cli", missing_gflow_message())
        self.assertIn("Instalar todo", missing_gflow_message())


class InstallStatusTests(unittest.TestCase):
    def test_version_helpers(self):
        from install import format_gflow_status, parse_version, version_newer, uv_zip_name

        self.assertEqual(parse_version("gflow-cli 0.72.0"), "0.72.0")
        self.assertTrue(version_newer("0.72.0", "0.71.0"))
        self.assertFalse(version_newer("0.71.0", "0.72.0"))
        self.assertIn("no instalado", format_gflow_status(None, "0.72.0"))
        self.assertIn("al día", format_gflow_status("0.72.0", "0.72.0"))
        self.assertIn("hay 0.72.0", format_gflow_status("0.71.0", "0.72.0"))
        self.assertTrue(uv_zip_name().startswith("uv-"))


if __name__ == "__main__":
    unittest.main()
