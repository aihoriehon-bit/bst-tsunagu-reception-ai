// Bounded reception dialogue; details are only taken from the visitor's answers.
export function initialReceptionState(role, identity) {
  if (role === 'employee') return { role, step: 'employee', ...(identity?.source === 'face' && identity.role === role ? {visitor: identity.name} : {}) };
  if (role === 'guest' && identity?.source === 'face' && identity.role === 'guest') {
    return { role, visitor: identity.name, step: 'recipient' };
  }
  return role === 'delivery' ? { role, purpose: '荷物のお届け', step: 'delivery' } : { role };
}
// Late face recognition may fill a missing name, but never replace an answer
// or restart a completed/correcting reception.
export function recognizeLateGuest(previous, identity) {
  if (identity?.source !== 'face' || identity.role !== 'guest' || !identity.name ||
      ['employee', 'delivery'].includes(previous.role) || previous.recipient ||
      ['confirm', 'correction', 'done', 'cancelled', 'finished'].includes(previous.step)) return null;
  return { key: 'chatGuestRecipient', state: {
    ...previous, role: 'guest', visitor: previous.visitor || identity.name, step: 'recipient',
  } };
}
export function isDeliveryArrival(text) {
  // A mention of parcels/company names alone is not a delivery arrival.
  if (/届かない|届いていない|紛失|再配達|では(?:あり)?ません|じゃ(?:あり)?ません|ではなく|じゃなく|について|の相談/.test(text)) return false;
  return /(?:荷物|お荷物|小包|郵便物|宅配便|書類).*(?:届け|とどけ|配達|配送|持って|もって)|(?:配達|配送|宅配)(?:に来|で来|です|でございます|に伺|しました)|(?:荷物|お届け物|お届けもの|おとどけもの)(?:です|でございます)|^(?:ヤマト|佐川|日本郵便)(?:運輸|急便)?(?:です|でございます)[。！!\s]*$/.test(text);
}
export function recognizeLateEmployee(previous, identity) {
  if (identity?.source !== 'face' || identity.role !== 'employee' ||
      previous.role === 'delivery' || ['confirm','correction','done','cancelled'].includes(previous.step)) return null;
  const requested = Boolean(previous.employeeRequest || previous.recipient);
  return { key: 'chatRecognizedEmployee', state: {
    ...previous, role: 'employee', visitor: previous.visitor || identity.name,
    ...(requested ? {employeeRequest:true} : {}), step: requested ? previous.step : 'employee',
  } };
}
export function respond(input, previous = {}) {
  const text = String(input).normalize('NFKC').trim().slice(0, 300);
  const state = { ...previous };
  const answer = (key, step = state.step || null) => ({ key, state: { ...state, step } });
  const next = (general = false) => {
    if (!state.recipient) return answer('chatRecipient', 'recipient');
    if (!state.visitor) return answer(general ? 'chatGeneral' : 'chatVisitorName', 'visitorName');
    if (!state.purpose) return answer(general ? 'chatGeneralPurpose' : 'chatPurpose', 'purpose');
    return answer(general ? 'chatGeneralConfirm' : 'chatConfirm', 'confirm');
  };
  const clean = value => value.replace(/[。！!\s]+$/, '').trim().slice(0, 80);
  const no = /^(いいえ|違い|ちがい|違う|ちがう|いいや|訂正|修正)/;
  const yes = /^(はい|ええ|うん|そうです|お願いします|大丈夫|間違いありません|合っています|確認しました)/;
  const anyone = /誰でも|だれでも|どなたでも|どなたか|誰か.*(お願い|呼ん|対応)|指定.*(ない|なし)|担当.*(わか[らり]|分か[らり]|知ら|不明)|総務|お任せ|おまかせ/;
  const prompt = () => ({employee:'chatRecognizedEmployee',recipient:'chatRecipient',visitorName:'chatVisitorName',purpose:'chatPurpose',confirm:'chatConfirm',correction:'chatCorrection',delivery:'chatDelivery'})[state.step] || 'chatHello';
  if (!text) return answer('chatUnknown');
  if (/^(リセット|最初から|やり直し|受付を開始)/.test(text)) return { key: 'chatHello', state: {} };
  if (/キャンセル|取り消し|取り消して|受付.*やめ/.test(text)) return { key:'chatCancel', state:{step:'cancelled'} };
  if (/ちょっと待って|少し待って|ちょっとまって|今調べ|確認します/.test(text)) return answer('chatPause');
  if (/呼び出し.*(でき|済|ました)|呼んで.*(くれた|くれました)|電話.*(つなが|繋が|した)|通知.*(送|届)/.test(text)) return answer('chatCallStatus');
  if (/どのくらい|どれくらい|何分|いつまで.*待|待ち時間|急いで/.test(text)) return answer('chatWaitTime');
  if (/トイレ|お手洗い|駐車場|営業時間|定休日|何時まで|何階|場所.*(どこ|教え)/.test(text)) return answer('chatFacility');
  if (/使い方|どうすれば|何て言えば|何を話せば|ヘルプ/.test(text)) return answer('chatHelp');
  if (/さようなら|さよなら|失礼します|帰ります|またね|バイバイ/.test(text)) return answer('chatBye', 'done');
  // Detect a delivery before interpreting the reply as a person's name or
  // purpose, including when the visitor corrects the original visit category.
  if (!['done', 'cancelled', 'finished'].includes(state.step) && isDeliveryArrival(text)) {
    delete state.recipient;
    state.role = 'delivery'; state.purpose = '荷物のお届け';
    return answer('chatDelivery', 'delivery');
  }
  if (/^(?:社員です|ただいま(?:です)?|出社しました|出勤しました)[。！!\s]*$/.test(text)) {
    state.role = 'employee';
    return answer('chatEmployee', state.employeeRequest || state.recipient ? state.step : 'employee');
  }
  const directRecipient = text.match(/^(.{1,40}?(?:さん|様|さま|担当))(?:を|に)?(?:お願いします|お願いできますか|呼んでください|呼んでもらえますか|呼んでいただけますか|会いたいです|に会いたいです)[。!！\s]*$/);
  if (state.role === 'employee' && !state.employeeRequest && !state.recipient) {
    const request = !/呼ばなくて|呼ばないで|取次ぎ不要|取り次ぎ不要/.test(text) &&
      (directRecipient || /呼んで(?:ください|もら|いただ)|(?:取次|取り次|お取り次ぎ).*(?:お願い|ください)/.test(text));
    if (request) {
      state.employeeRequest = true;
      if (directRecipient) { state.recipient = directRecipient[1]; return next(); }
      if (anyone.test(text)) { state.recipient = '総務担当者'; return next(true); }
      return answer('chatRecipient','recipient');
    }
  }
  if (/訂正|修正|間違え|名前.*違/.test(text)) {
    if (/用件|用事|目的/.test(text)) { delete state.purpose; return answer('chatPurpose','purpose'); }
    if (/担当|相手|宛先/.test(text)) { delete state.recipient; return answer('chatRecipient','recipient'); }
    if (/名前|自分|私|わたし/.test(text)) { delete state.visitor; return answer('chatVisitorName','visitorName'); }
    return answer('chatCorrection', 'correction');
  }
  if (state.step === 'correction') {
    if (/用件|用事|目的/.test(text)) { delete state.purpose; return answer('chatPurpose','purpose'); }
    if (/担当|相手|宛先/.test(text)) { delete state.recipient; return answer('chatRecipient', 'recipient'); }
    if (/名前|自分|私|わたし/.test(text)) { delete state.visitor; return answer('chatVisitorName', 'visitorName'); }
    return answer('chatCorrection', 'correction');
  }
  if (state.step === 'confirm' && no.test(text)) return answer('chatCorrection', 'correction');
  if (state.step === 'confirm' && yes.test(text)) {
    if (!state.recipient || !state.visitor || !state.purpose) return next();
    return answer(state.recipient === '総務担当者' ? 'chatGeneralComplete' : 'chatReceived', 'done');
  }
  if (/ありがとう|助かりま/.test(text)) return answer('chatThanks');
  if (/どんな会社|何の会社|会社.*(教え|案内|事業)|事業内容|通信設備|防犯カメラ/.test(text) && !/相談|打ち合わせ/.test(text)) return answer('chatCompany');
  if (/あなた.*(誰|名前)|君.*誰|自己紹介|つなぐ.*(何|誰)|何ができ/.test(text)) return answer('chatIdentity');
  if (/もう一度|もう一回|聞こえな|聞き取れ|なんですか|何ですか|準備でき|お待たせ/.test(text)) return answer(prompt());
  if (/^(こんにちは|おはよう(?:ございます)?|こんばんは|はじめまして)[!！。\s]*$/.test(text)) return answer(prompt());
  // Normal staff arrivals/utterances must not fall into the visitor intake.
  if (state.role === 'employee' && !state.employeeRequest && !state.recipient) {
    return answer(/^(?:お疲れ|おつかれ)/.test(text) ? 'chatRecognizedEmployee' : 'chatNoPurpose', 'employee');
  }
  if (state.step === 'delivery' && (anyone.test(text) || yes.test(text))) return answer('chatDelivery');
  if (state.step === 'visitorName') {
    if (/分から|わから|言いたくない|教えたくない|匿名|名乗りたくない/.test(text)) return answer('chatNameRequired');
    if (anyone.test(text) || /^(はい|いいえ)[。!！\s]*$/.test(text) || /[?？]$/.test(text)) return answer('chatVisitorName');
    state.visitor = clean(text.replace(/^(私の名前は|わたしの名前は|名前は|私は|わたしは)/, '').replace(/(と申します|です)[。!！\s]*$/, ''));
    if (!state.visitor) return answer('chatVisitorName');
    return next();
  }
  if (state.role === 'employee' && /^(特に|とくに)?(用事は|用件は|何も)?(ありません|ないです|ない)[。!！\s]*$/.test(text)) return answer('chatNoPurpose','finished');
  if (state.step === 'purpose') {
    if (/^(はい|いいえ)[。!！\s]*$/.test(text)) return answer('chatPurpose');
    state.purpose = clean(text); return next();
  }
  if (state.step === 'recipient' || anyone.test(text)) {
    if (anyone.test(text) || /^(わかりません|分かりません|特にない|不明)/.test(text)) state.recipient = '総務担当者';
    else if (/^(はい|いいえ)[。!！\s]*$/.test(text) || /[?？]$/.test(text)) return answer('chatRecipient', 'recipient');
    else state.recipient = clean(text.replace(/^(担当者は|宛先は)/, '').replace(/(に会いたいです|に会いたい|に会いに来ました|をお願いします|お願いします|です)[。!！\s]*$/, ''));
    return next(state.recipient === '総務担当者');
  }
  if (directRecipient) { state.recipient = directRecipient[1]; return next(); }
  if (/と申します|^(私の名前は|名前は)|^[一-龯々]{1,8}です[。！!\s]*$/.test(text) && !/面会|訪問|営業|商談|点検|修理|打合|相談|資料|書類/.test(text)) {
    state.visitor = clean(text.replace(/^(私の名前は|名前は)/, '').replace(/(と申します|です)[。!！\s]*$/, ''));
    return answer('chatPurpose', 'purpose');
  }
  if (/担当|取次|取り次|会いた|会いに|打ち合わせ|打合せ|アポ|約束|予約|相談|お客|訪問|面会|商談|ミーティング|営業|修理|点検|資料|書類/.test(text)) {
    state.role = 'guest'; state.purpose = clean(text);
    const match = text.match(/^(.{1,40}?さん)に(?:会い|会う)/);
    if (match) { state.recipient = clean(match[1]); return next(); }
    return answer('chatRecipient', 'recipient');
  }
  if (state.step === 'confirm') return answer('chatConfirm', 'confirm');
  return answer('chatUnknown');
}
