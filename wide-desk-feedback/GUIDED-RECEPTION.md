# 選択式受付（2026-09-17 確認用）

公開先は `wide-desk-preview/` のみ。本番の `index.html` / `app.js` / `automatic-conversation.js` / `dialogue.mjs` / `preview.css` は変更していない。

- `guided-app.js` は公開済みappの独立コピー。受付プラン/会話の参照と来客テスト時間を変更。
- `guided-conversation.js` は公開済み会話コントローラーの独立コピー。番号UI、段階質問、総務案内の前置き、後追い認証後の質問再開を追加。
- `guided-dialogue.mjs`: 3択→目的/担当者/名前→確認。番号は現在の質問にだけ適用。履歴から戻る/訂正。名前は登録済みなら再質問しない。
- `guided-panel.mjs` / `guided.css`: 右下の選択カード。案内中もボタンは利用可、音声は聞き取り開始後。自由入力は名前と「その他」の用件だけ。確認は既存の中央カード。
- `guided-audio/`: 春日部つむぎの全文収録13本。生成はローカルVOICEVOX、`tools/generate_guided_voicevox.py`。有料サービス/実際の電話・通知は追加しない。

本番へ採用するときはユーザーの承認を得る。共通ファイルを上書きして比較差分を消さない。今後共通部へ不具合修正する際は、独立コピーにも同じ修正が必要か確認する。

## テスト

`node --test --test-timeout=10000 wide-desk-feedback/guided-dialogue.test.mjs wide-desk-feedback/release-entry.test.mjs`

番号解釈（全角・漢数字・番です）、3経路、既知名、遅延認証、社員、訂正、戻る、録音ファイル、公開先の分離を検査。物理カメラ/マイクの精度はこのテストでは保証しない。
