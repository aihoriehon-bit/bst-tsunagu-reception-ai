// Deterministic, bounded demo. User text is never executed or sent to an AI endpoint.
export function respond(input, previous = {}) {
  const text = String(input).normalize('NFKC').trim().slice(0, 300);
  const answer = (key, step = null) => ({ key, state: { step } });
  if (/^(?:リセット|最初から|やり直し)/.test(text)) return answer('chatHello');
  if (/さようなら|さよなら|失礼します|帰ります|またね|バイバイ/.test(text)) return answer('chatBye');
  if (/ありがとう|助かりま/.test(text)) return answer('chatThanks');
  if (/どんな会社|何の会社|会社.*(教え|案内|事業)|事業内容|通信設備|防犯カメラ/.test(text)) return answer('chatCompany');
  if (/あなた.*(誰|名前)|君.*誰|自己紹介|つなぐ.*(何|誰)|何ができ/.test(text)) return answer('chatIdentity');
  if (/配達|配送|荷物|宅配|お届け|ヤマト|佐川|郵便/.test(text)) return answer('chatDelivery', 'deliveryName');
  if (/ただいま|社員です|出社/.test(text)) return answer('chatEmployee');
  if (/^(?:こんにちは|おはよう|こんばんは|はじめまして)[!！。\s]*$/.test(text)) return answer('chatHello');
  if (previous.step === 'appointment') {
    if (/いいえ|ない|なし|ありません|していません/.test(text)) return answer('chatPurpose', 'purpose');
    if (/はい|あります|していま|約束|予約/.test(text)) return answer('chatWho', 'visitorName');
  }
  if (['deliveryName', 'visitorName', 'purpose'].includes(previous.step)) {
    if (/わから|分から|知ら|不明/.test(text)) return answer('chatReceived');
    if (text.length >= 2 && !/[?？]$/.test(text)) return answer('chatReceived');
  }
  if (/担当|取次|取り次|会いた|会いに|打ち合わせ|打合せ|アポ|約束|予約|相談/.test(text)) return answer('chatAppointment', 'appointment');
  return answer('chatUnknown');
}
