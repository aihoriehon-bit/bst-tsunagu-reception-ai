import unittest
import json
from pathlib import Path
from generate_feedback_voicevox import spoken_text

class PronunciationTest(unittest.TestCase):
    def test_person_not_direction(self):
        self.assertEqual(spoken_text('社員の方・お越しになった方'), '社員のかた・お越しになったかた')
        self.assertEqual(spoken_text('カメラの方を見てください'), 'カメラの方を見てください')

    def test_no_duplicate_shi_or_gi(self):
        self.assertEqual(spoken_text('お話しください。お取次ぎ先。受付AI。'), 'おはなしください。おとりつぎ先。受付エーアイ。')

    def test_generated_readings(self):
        root = Path(__file__).resolve().parents[1]
        report = json.loads((root / 'wide-desk-feedback/audio/generation.json').read_text())
        for key in ('chatHello', 'chatNameRequired'):
            kana = report[key]['kana'].replace("'", '').replace('_', '').replace('/', '')
            self.assertIn('カタノ', kana)
            self.assertNotIn('ホオノ', kana)
        kana = report['chatHelp']['kana'].replace("'", '').replace('_', '').replace('/', '')
        self.assertIn('オハナシクダサイ', kana)
        self.assertNotIn('オハナシシ', kana)

    def test_delivery_call_not_going(self):
        self.assertEqual(spoken_text('実際の呼び出しは行っていません。'), '実際の呼び出しはおこなっていません。')
        root = Path(__file__).resolve().parents[1]
        report = json.loads((root / 'wide-desk-feedback/audio/generation.json').read_text())
        kana = report['chatDeliveryCall']['kana'].replace("'", '').replace('_', '').replace('/', '')
        self.assertIn('オコナッテ', kana)

if __name__ == '__main__':
    unittest.main()
