// Only recognition's real start event may invite the visitor to speak.
export function conversationCue({ speaking, enabled, supported, audible, active, present, visible = true, micStatus, issue = '' }) {
  const cue = (mode, label, title, detail) => ({ mode, label, title, detail });
  if (!visible) return cue('paused', '一時停止', '聞き取りを止めています', '画面に戻ると受付を再開します。');
  if (issue) return cue('error', '確認してください', '音声会話を再開できません', issue);
  if (!audible) return cue('paused', '音声OFF', '音声をONにしてください', '右上の音声ボタンで会話を再開できます。');
  if (speaking) return cue('speaking', 'つなぐの番', 'つなぐが話しています', 'いまは聞き取りを止めています。「どうぞ、お話しください」に変わってからお話しください。');
  if (!supported) return cue('error', 'マイク非対応', '文字入力をご利用ください', 'このブラウザでは音声入力を利用できません。下の「会話内容・文字入力」から入力できます。');
  if (!enabled) return cue('paused', 'マイクOFF', 'まず、マイクを許可してください', '一度許可すると、つなぐの挨拶後にお話しいただけます。');
  if (['permission', 'unavailable', 'network'].includes(micStatus)) return cue('error', '聞き取り停止中', 'マイクの接続を確認してください', micStatus === 'network' ? '聞き取りの接続が切れました。「再接続」を押してください。' : 'マイクの許可や接続を確認し、「マイクを許可」を押してください。');
  if (!present) return cue('waiting', '受付待機', 'カメラの前でお待ちください', '来訪者を確認してから挨拶します。まだ聞き取りは始まっていません。');
  if (!active) return cue('waiting', '挨拶の準備中', 'つなぐの挨拶をお待ちください', '挨拶が終わると、話すタイミングをここに表示します。');
  if (micStatus === 'listening') return cue('listening', 'あなたの番・マイクON', 'どうぞ、お話しください', 'いま、聞き取っています。ご用件をお話しください。');
  if (micStatus === 'processing') return cue('preparing', 'お待ちください', '返答を準備しています', '聞き取りを止めています。つなぐの返答をお待ちください。');
  return cue('preparing', 'もう少しお待ちください', 'マイクを準備しています', 'まだ聞き取りは始まっていません。緑色の表示に変わったらお話しください。');
}
