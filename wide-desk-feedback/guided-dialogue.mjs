// Comparison-only, bounded choices. Never infer an appointment or send a call.
import { respond as legacyRespond } from './dialogue.mjs?v=20260915-short-call-1';
import { receptionPlan as originalPlan } from './visitor-matching.mjs?v=20260915-group-names-1';

export const GUIDED_TEXTS = {
  guideRoute: 'ご用件を番号でお選びください。1番、弊社スタッフとお約束。2番、宅急便や納品など。3番、お約束なしのご来訪。画面のボタンでも選べます。',
  guideRecipientChoice: 'お呼びする担当者について、1番、名前を伝える。2番、担当者が分からないので総務に取り次ぐ。どちらでしょうか？',
  guideDeliveryType: 'お届けの種類をお選びください。1番、宅急便や郵便。2番、商品の納品。3番、その他のお届け物。',
  guideDeliveryRecipientChoice: 'お荷物の宛先について、1番、宛先の名前を伝える。2番、宛先が分からないので総務に取り次ぐ。どちらでしょうか？',
  guideRecipientName: '担当者のお名前をお話しください。画面から文字でも入力できます。分からない場合は、総務を選んでください。',
  guideDeliveryName: 'お荷物の宛先のお名前をお話しください。画面から文字でも入力できます。分からない場合は、総務を選んでください。',
  guideVisitorName: 'お越しになった、あなたのお名前をお願いします。画面から文字でも入力できます。',
  guidePurpose: 'ご用件をお選びください。1番、打ち合わせや面会。2番、ご相談。3番、営業のご案内。4番、その他。',
  guidePurposeDetail: 'ご用件を簡単にお話しください。文字でも入力できます。',
  guideCorrection: '訂正する項目をお選びください。1番、来訪の種類。2番、担当者や宛先。3番、ご自身のお名前。4番、ご用件。',
  guideDeliveryCorrection: '訂正する項目をお選びください。1番、来訪の種類。2番、お荷物の宛先。3番、お届けの種類。',
  guideEmployee: 'お取り次ぎは必要でしょうか？1番、受付を利用する。2番、必要ありません。',
  guideGeneral: 'では、総務担当者をお呼びいたしますね。',
};
const choice = (label, value) => ({ label, value });
export function choicesFor(state) {
  const delivery = state.role === 'delivery';
  switch (state.step) {
    case 'route': return { key: 'guideRoute', title: 'ご用件をお選びください', options: [choice('弊社スタッフとお約束','1'),choice('宅急便や納品など','2'),choice('お約束なしの来訪','3')] };
    case 'employee': return {key:'guideEmployee',title:'お取り次ぎは必要ですか？',options:[choice('受付を利用する','1'),choice('必要ありません','2')]};
    case 'deliveryType': return {key:'guideDeliveryType',title:'お届けの種類をお選びください',options:[choice('宅急便・郵便','1'),choice('商品の納品','2'),choice('その他のお届け物','3')]};
    case 'recipientChoice': return {key:delivery?'guideDeliveryRecipientChoice':'guideRecipientChoice', title:delivery?'お荷物の宛先は分かりますか？':'お呼びする担当者は分かりますか？', options:[choice(delivery?'宛先の名前を伝える':'担当者の名前を伝える','1'),choice('分からない・総務に取り次ぐ','2')]};
    case 'recipient': return {key:delivery?'guideDeliveryName':'guideRecipientName',title:delivery?'宛先のお名前をお願いします':'担当者のお名前をお願いします',options:[],input:true,general:true};
    case 'visitorName': return {key:'guideVisitorName',title:'あなたのお名前をお願いします',options:[],input:true};
    case 'purposeChoice': return {key:'guidePurpose',title:'ご用件をお選びください',options:[choice('打ち合わせ・面会','1'),choice('ご相談','2'),choice('営業のご案内','3'),choice('その他','4')]};
    case 'purpose': return {key:'guidePurposeDetail',title:'ご用件を簡単にお聞かせください',options:[],input:true};
    case 'correction': return {key:delivery?'guideDeliveryCorrection':'guideCorrection',title:'訂正する項目をお選びください',options:delivery?[choice('来訪の種類','1'),choice('お荷物の宛先','2'),choice('お届けの種類','3')]:[choice('来訪の種類','1'),choice('担当者','2'),choice('ご自身のお名前','3'),choice('ご用件','4')]};
    case 'confirm': return {key:delivery?'chatDeliveryConfirm':'chatConfirm',title:'受付内容をご確認ください',options:[]};
    default: return {key:'guideRoute',title:'ご用件をお選びください',options:[]};
  }
}
export function initialReceptionState(role, identity) {
  return {role:role || 'guest', step:role==='employee'?'employee':'route',
    ...(identity?.source==='face' && identity.name ? {visitor:identity.name,recognizedName:identity.name} : {})};
}
export function receptionPlan(person, defaultKey, demoKey) {
  const plan = originalPlan(person, defaultKey, demoKey);
  const greet = plan.role==='employee'?'chatRecognizedEmployee':plan.identity ? plan.role==='delivery'?'chatRecognizedDelivery':'chatRecognizedGuest':'welcome';
  plan.greeting = [...(plan.identity?['registeredName']:[]),greet,plan.role==='employee'?'guideEmployee':'guideRoute'];
  plan.idle = [];
  return plan;
}
// Accept only a single, unambiguous selection; '1か2' must not select 1.
export function spokenNumber(input) {
  const text=String(input).normalize('NFKC').trim().replace(/[。！!、,？?\s]+$/,'');
  const m=text.match(/^(?:えっと[、\s]*|えーと[、\s]*)?([1-4一二三四]|いち|に|さん|よん)(?:番(?:目)?|ばん)?(?:で(?:す|お願いします)?|です|をお願いします|お願いします)?$/);
  return m ? ({一:1,二:2,三:3,四:4,いち:1,に:2,さん:3,よん:4}[m[1]] || Number(m[1])) : null;
}
const anyone = /^(?:誰でも(?:いい(?:です)?)?|だれでも(?:いい(?:です)?)?|分かりません|わかりません|総務(?:担当者)?(?:をお願いします)?)[。！!\s]*$/;
const clean = text => text.replace(/[。！!\s]+$/,'').trim().slice(0,80);
function next(state) {
  if (!state.category) state.step='route';
  else if (state.role==='delivery' && !state.purpose) state.step='deliveryType';
  else if (!state.recipient) state.step='recipientChoice';
  else if (state.role!=='delivery' && !state.visitor) state.step='visitorName';
  else if (!state.purpose) state.step='purposeChoice';
  else state.step='confirm';
  return {key:choicesFor(state).key,state};
}
export function recognizeLateVisitor(previous, identity) {
  if (identity?.source!=='face' || !identity.name || ['done','cancelled','confirm','correction','finished'].includes(previous.step)) return null;
  const state={...previous, visitor:previous.visitor || identity.name, recognizedName:identity.name};
  // Identification is not permission to discard an explicitly selected route.
  if (!state.category && identity.role==='employee') {state.role='employee';state.step='employee';}
  if (state.step==='visitorName') next(state);
  return {state,key:identity.role==='employee'?'chatRecognizedEmployee':identity.role==='delivery'?'chatRecognizedDelivery':'chatRecognizedGuest'};
}
export const recognizeLateGuest = recognizeLateVisitor;
export const recognizeLateEmployee = () => null;

export function respond(input, previous={}) {
  const text=String(input).normalize('NFKC').trim().slice(0,300);
  let state={...previous};
  state.step ||= 'route';
  const reply=()=>({key:choicesFor(state).key,state});
  const move=step=>{ state.step=step; return reply(); };
  if (/^(最初から|やり直し|リセット|受付を開始)/.test(text)) return {key:'guideRoute',state:{role:'guest',visitor:state.recognizedName,recognizedName:state.recognizedName,step:'route'}};
  if (/^(キャンセル|取り消し)/.test(text)) return {key:'chatCancel',state:{...state,step:'cancelled'}};
  if (/^(もう一度|もう一回|聞こえない|使い方|ヘルプ|こんにちは|おはよう|こんばんは)/.test(text)) return reply();
  if (/^(戻る|もどる|前に戻)/.test(text)) {
    const history=state.history || [];
    if (!history.length) return reply();
    state={...history[history.length-1],history:history.slice(0,-1)}; return reply();
  }
  if (['done','cancelled','finished'].includes(state.step)) return {key:'chatNoPurpose',state};
  const snapshot={...state}; delete snapshot.history;
  const advance=result=>({ ...result, state:{...result.state,history:[...(previous.history||[]),snapshot].slice(-15)} });
  let n=spokenNumber(text);
  if (state.step==='confirm') {
    if (/^(訂正|いいえ|違|ちが|修正)/.test(text)) return advance(move('correction'));
    if (/^(はい|合っています|あっています|間違いありません|大丈夫です|お願いします)[。！!\s]*$/.test(text)) {
      const result=legacyRespond('はい',state); return advance(result);
    }
    return reply();
  }
  if (/^(訂正|修正)[。！!\s]*$/.test(text)) return advance(move('correction'));
  if (state.step==='employee') {
    if (n===1 || /呼んで|取り次|受付/.test(text)) return advance(move('route'));
    if (n===2 || /不要|必要ありません|お疲れ/.test(text)) return {key:'chatNoPurpose',state:{...state,step:'employee'}};
    return reply();
  }
  if (state.step==='route') {
    if (/^(?:お)?約束(?:は)?(?:なし|無し)|約束していない|アポなし/.test(text)) n=3;
    else if (/^(宅急便|宅配便|配達|納品|荷物を届け)/.test(text)) n=2;
    else if (/^(?:お)?約束(?:が)?あります|^予約しています/.test(text)) n=1;
    if (![1,2,3].includes(n)) return reply();
    state={role:n===2?'delivery':'guest',category:['','appointment','delivery','walkIn'][n],visitor:state.visitor,recognizedName:state.recognizedName};
    return advance(move(n===2?'deliveryType':n===3?'purposeChoice':'recipientChoice'));
  }
  if (state.step==='deliveryType') {
    if (![1,2,3].includes(n)) return reply();
    state.purpose=['','宅急便・郵便のお届け','商品の納品','その他のお届け物'][n]; return advance(next(state));
  }
  if (state.step==='recipientChoice') {
    if (anyone.test(text)) n=2;
    if (n===1) return advance(move('recipient'));
    if (n===2) { state.recipient='総務担当者'; const result=next(state); result.prefix='guideGeneral'; return advance(result); }
    return reply();
  }
  if (state.step==='purposeChoice') {
    if (![1,2,3,4].includes(n)) return reply();
    if (n===4) return advance(move('purpose'));
    state.purpose=['','打ち合わせ・面会','ご相談','営業のご案内'][n]; return advance(next(state));
  }
  if (state.step==='correction') {
    if (n===1) return advance(move('route'));
    if (n===2) {delete state.recipient;delete state.recipientReading;delete state.recipientReadingFor;return advance(move('recipientChoice'));}
    if (n===3 && state.role==='delivery') {delete state.purpose;return advance(move('deliveryType'));}
    if (n===3) {delete state.visitor;return advance(move('visitorName'));}
    if (n===4 && state.role!=='delivery') {delete state.purpose;return advance(move('purposeChoice'));}
    return reply();
  }
  if (state.step==='recipient' && anyone.test(text)) {state.recipient='総務担当者';const result=next(state);result.prefix='guideGeneral';return advance(result);}
  // Courtesy, requests and pure numbers are never saved as somebody's name.
  if (!text || /^(はい|いいえ|ありがとう|分かりません|わかりません)|[?？]$/.test(text) || n || /^\d+$/.test(text) || /呼んで(?:ほしい|欲しい|ください)?[。！!\s]*$/.test(text) && !/さん|さま|様/.test(text)) return reply();
  if (state.step==='recipient') {
    const value=clean(text.replace(/^(担当者は|宛先は|お届け先は)/,'').replace(/(?:宛て|あて)?(?:を呼んでください|を呼んでほしい|をお願いします|お願いします|です|と申します)[。！!\s]*$/,''));
    if (!value) return reply(); state.recipient=value;return advance(next(state));
  }
  if (state.step==='visitorName') {
    if (/匿名|言いたくない|名乗りたくない/.test(text)) return {key:'chatNameRequired',state};
    const value=clean(text.replace(/^(私の名前は|わたしの名前は|名前は|私は|わたしは)/,'').replace(/(?:と申します|です)[。！!\s]*$/,''));
    if (!value) return reply();state.visitor=value;return advance(next(state));
  }
  if (state.step==='purpose') {state.purpose=clean(text);return advance(next(state));}
  return reply();
}
