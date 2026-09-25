import { receptionPlan as originalPlan } from './visitor-matching.mjs?v=20260915-group-names-1';
import { DIRECTORY, departmentById, directoryPage, PAGE_SIZE } from './guided-directory.mjs?v=20260921-kiosk-1';
import { spokenNumber } from './guided-speech-input.mjs?v=20260921-kiosk-1';
export { spokenNumber };
const c=(label,value)=>({label,value:String(value)});
const pageOptions=(items,page,format)=>[
  ...directoryPage(items,page).map((item,i)=>c(format(item),i+1)),
  ...(items.length>(page+1)*PAGE_SIZE?[c('次の候補',5)]:[]),...(page>0?[c('前の候補',6)]:[]),
];
const sample=DIRECTORY.sample?'（仮）':'';
export const GUIDED_TEXTS={
  guideRoute:'ご用件を番号でお答えください。1番、弊社スタッフとお約束。2番、宅急便や納品など。3番、お約束なしのご来訪。',
  guideDeliveryType:'お届けの種類を番号でお答えください。1番、宅急便や郵便。2番、商品の納品。3番、その他のお届け物。',
  guidePurpose:'ご用件を番号でお答えください。1番、打ち合わせや面会。2番、ご相談。3番、営業のご案内。4番、その他。',
  guideCompany:'まず、お越しになった方の会社名だけをお話しください。個人でお越しの場合は、個人です、とお答えください。',
  guideCompanyCheck:'画面の会社名で合っていますか？1番、合っています。2番、会社名を言い直す。3番、会社名なし、個人での来訪。',
  guideName:'次に、あなたのお名前だけをお話しください。',
  guideNameCheck:'画面のお名前で合っていますか？1番、合っています。2番、お名前を言い直す。',
  guideConfirm:'受付内容をご確認ください。1番、受付を完了。2番、担当者を訂正。3番、会社名を訂正。4番、お名前を訂正。5番、ご用件を訂正。6番、来訪の種類を訂正。',
  guideEmployee:'お取り次ぎは必要ですか？1番、受付を利用する。2番、必要ありません。',
  guideGeneral:'では、総務担当者へのお取り次ぎで承ります。',
  guideUnclear:'すみません、番号を一つに絞れませんでした。画面の番号を、もう一度お答えください。',
  guideRetry:'すみません、うまく聞き取れませんでした。緑のマイクが表示されてから、もう一度お願いします。',
  guideComplete:'受付内容を確認しました。ここまでが受付デモです。実際の呼び出しは行っていません。ご協力ありがとうございました。',
};
for(let page=0;page<Math.ceil(DIRECTORY.departments.length/PAGE_SIZE);page++){
  const options=pageOptions(DIRECTORY.departments,page,d=>d.reading);
  GUIDED_TEXTS[`guideDepartment${page}`]='お呼びする部署を番号でお答えください。'+options.map(o=>`${o.value}番、${o.label}。`).join('')+'7番、部署が分からないので総務へ。';
}
for(const d of DIRECTORY.departments)for(let page=0;page<Math.ceil(d.people.length/PAGE_SIZE);page++){
  const options=pageOptions(d.people,page,p=>p.reading);
  GUIDED_TEXTS[`guideStaff_${d.id}_${page}`]=`${d.reading}の担当者を番号でお答えください。`+options.map(o=>`${o.value}番、${o.label}。`).join('')+'7番、この部署のどなたでも。';
}
export function choicesFor(s){
  const o=(key,title,options,extra={})=>({key,title,options,...extra});
  switch(s.step){
    case 'employee':return o('guideEmployee','お取り次ぎは必要ですか？',[c('受付を利用する',1),c('必要ありません',2)]);
    case 'deliveryType':return o('guideDeliveryType','お届けの種類をお選びください',[c('宅急便・郵便',1),c('商品の納品',2),c('その他のお届け物',3)]);
    case 'purposeChoice':return o('guidePurpose','ご用件をお選びください',[c('打ち合わせ・面会',1),c('ご相談',2),c('営業のご案内',3),c('その他',4)]);
    case 'department':return o(`guideDepartment${s.page||0}`,'お呼びする部署をお選びください',[...pageOptions(DIRECTORY.departments,s.page||0,d=>d.name+sample),c('分からない・総務へ',7)],{sample:DIRECTORY.sample});
    case 'staff':{
      const d=departmentById(s.departmentId);if(!d)return choicesFor({...s,step:'department',page:0});
      return o(`guideStaff_${d.id}_${s.page||0}`,`${d.name}の担当者をお選びください`,[...pageOptions(d.people,s.page||0,p=>p.name+sample),c('この部署のどなたでも',7)],{sample:DIRECTORY.sample});
    }
    case 'company':return o('guideCompany','あなたの会社名をお話しください',[],{voiceField:true,fieldLabel:'聞き取った会社名'});
    case 'companyCheck':return o('guideCompanyCheck','会社名は合っていますか？',[c('合っています',1),c('会社名を言い直す',2),c('個人での来訪',3)],{value:s.company,fieldLabel:'会社名'});
    case 'visitorName':return o('guideName','あなたのお名前をお話しください',[],{voiceField:true,fieldLabel:'聞き取ったお名前'});
    case 'nameCheck':return o('guideNameCheck','お名前は合っていますか？',[c('合っています',1),c('名前を言い直す',2)],{value:s.visitor,fieldLabel:'お名前'});
    case 'confirm':return o('guideConfirm','受付内容をご確認ください',[c('受付を完了',1),c('担当者を訂正',2),c('会社名を訂正',3),c('名前を訂正',4),c('用件を訂正',5),c('来訪の種類を訂正',6)]);
    default:return o('guideRoute','ご用件をお選びください',[c('弊社スタッフとお約束',1),c('宅急便や納品など',2),c('お約束なしの来訪',3)]);
  }
}
export function initialReceptionState(role,identity){
  const known=identity?.source==='face'&&identity.name;
  return {role:role||'guest',step:role==='employee'?'employee':'route',...(known?{visitor:identity.name,recognizedName:identity.name}:{})};
}
export function receptionPlan(person,defaultKey,demoKey){
  const p=originalPlan(person,defaultKey,demoKey);
  const greet=p.role==='employee'?'chatRecognizedEmployee':p.role==='delivery'?'chatRecognizedDelivery':p.identity?'chatRecognizedGuest':'welcome';
  p.greeting=[...(p.identity?['registeredName']:[]),greet,p.role==='employee'?'guideEmployee':'guideRoute'];p.idle=[];return p;
}
function next(s){
  if(!s.category)s.step='route';
  else if(!s.purpose)s.step=s.role==='delivery'?'deliveryType':'purposeChoice';
  else if(!s.recipient){s.step='department';s.page=0;}
  else if(!s.companyConfirmed)s.step=s.company?'companyCheck':'company';
  else if(!s.visitorConfirmed)s.step=s.visitor?'nameCheck':'visitorName';
  else s.step='confirm';
  return {state:s,key:choicesFor(s).key};
}
export function recognizeLateVisitor(previous,identity){
  if(identity?.source!=='face'||!identity.name||['confirm','done','cancelled'].includes(previous.step))return null;
  const s={...previous,recognizedName:identity.name};
  if(!s.visitor&&!s.nameRetry){s.visitor=identity.name;s.visitorConfirmed=false;if(s.step==='visitorName')s.step='nameCheck';}
  if(!s.category&&identity.role==='employee'){s.role='employee';s.step='employee';}
  return {state:s,key:identity.role==='employee'?'chatRecognizedEmployee':identity.role==='delivery'?'chatRecognizedDelivery':'chatRecognizedGuest'};
}
export const recognizeLateGuest=recognizeLateVisitor;
export const recognizeLateEmployee=()=>null;
function spokenField(text,kind){
  if(!text||text.length>80||spokenNumber(text)!==null||/^(はい|いいえ|分かりません|わかりません|もう一度|ありがとう|音声認識に失敗|聞き取れ)/.test(text))return null;
  let value=text.replace(/[。！!\s]+$/,'').replace(/(?:と申します|でございます|です)$/,'');
  value=value.replace(kind==='company'?/^(?:会社名は|会社は|勤務先は|所属は)/:/^(?:私の名前は|わたしの名前は|名前は|私は|わたしは)/,'').trim();
  return value||null;
}
export function respond(input,previous={}){
  const text=String(input).normalize('NFKC').trim().slice(0,300);
  let s={...previous,step:previous.step||'route'};
  const answer=(extra={})=>({state:s,key:choicesFor(s).key,...extra}),n=spokenNumber(text);
  if(n===0||/^(もう一度|もう一回|聞き直し|聞こえない)/.test(text))return answer();
  if(n===9||/^(戻る|もどる|前に戻)/.test(text)){
    const history=s.history||[];if(!history.length)return answer();s={...history.at(-1),history:history.slice(0,-1)};return answer();
  }
  if(/^(最初から|やり直し|リセット)/.test(text))return {key:'guideRoute',state:initialReceptionState('guest',null)};
  if(/^(キャンセル|取り消し)/.test(text))return {key:'chatCancel',state:{...s,step:'cancelled'}};
  const snapshot={...s};delete snapshot.history;
  const advance=result=>({...result,state:{...result.state,history:[...(previous.history||[]),snapshot].slice(-25)}});
  const move=step=>{s.step=step;s.page=0;return advance(answer());};
  const retry=()=>answer({prefix:choicesFor(s).voiceField?'guideRetry':'guideUnclear',unrecognized:true});
  if(s.step==='employee'){
    if(n===1)return move('route');if(n===2)return {key:'chatNoPurpose',state:s};return retry();
  }
  if(s.step==='route'){
    if(![1,2,3].includes(n))return retry();
    s={role:n===2?'delivery':'guest',category:['','appointment','delivery','walkIn'][n],visitor:s.visitor,recognizedName:s.recognizedName,company:s.company,companyConfirmed:s.companyConfirmed,visitorConfirmed:s.visitorConfirmed};
    return move(n===2?'deliveryType':'purposeChoice');
  }
  if(s.step==='purposeChoice'||s.step==='deliveryType'){
    const purposes=s.step==='deliveryType'?['宅急便・郵便のお届け','商品の納品','その他のお届け物']:['打ち合わせ・面会','ご相談','営業のご案内','その他のご用件'];
    if(!n||!purposes[n-1])return retry();s.purpose=purposes[n-1];return advance(next(s));
  }
  if(s.step==='department'||s.step==='staff'){
    const items=s.step==='department'?DIRECTORY.departments:departmentById(s.departmentId)?.people||[],page=s.page||0;
    if(n===5&&items.length>(page+1)*PAGE_SIZE){s.page=page+1;return advance(answer());}
    if(n===6&&page>0){s.page=page-1;return advance(answer());}
    if(n===7){
      const d=s.step==='staff'?departmentById(s.departmentId):null;
      s.department=d?.name||'総務';s.departmentId=d?.id||'general';s.recipient=`${s.department}担当者`;s.recipientReading=d?`${d.reading}たんとうしゃ`:'そうむたんとうしゃ';s.staffId=null;
      return advance({...next(s),...(d?{}:{prefix:'guideGeneral'})});
    }
    const selected=n>=1&&n<=PAGE_SIZE?directoryPage(items,page)[n-1]:null;if(!selected)return retry();
    if(s.step==='department'){s.departmentId=selected.id;s.department=selected.name;delete s.recipient;delete s.staffId;return move('staff');}
    s.staffId=selected.id;s.recipient=selected.name;s.recipientReading=selected.reading;return advance(next(s));
  }
  if(s.step==='company'){
    if(/^(個人|こじん|会社名なし|会社なし)(?:です)?[。！!\s]*$/.test(text)){s.company='個人での来訪';s.companyConfirmed=true;return advance(next(s));}
    const value=spokenField(text,'company');if(!value)return retry();s.company=value;s.companyConfirmed=false;return move('companyCheck');
  }
  if(s.step==='companyCheck'){
    if(n===1||/^(はい|合っています|あっています)[。！!\s]*$/.test(text)){s.companyConfirmed=true;return advance(next(s));}
    if(n===2){delete s.company;s.companyConfirmed=false;return move('company');}
    if(n===3){s.company='個人での来訪';s.companyConfirmed=true;return advance(next(s));}return retry();
  }
  if(s.step==='visitorName'){
    const value=spokenField(text,'name');if(!value)return retry();s.visitor=value;s.visitorConfirmed=false;return move('nameCheck');
  }
  if(s.step==='nameCheck'){
    if(n===1||/^(はい|合っています|あっています)[。！!\s]*$/.test(text)){s.visitorConfirmed=true;return advance(next(s));}
    if(n===2){delete s.visitor;s.visitorConfirmed=false;s.nameRetry=true;return move('visitorName');}return retry();
  }
  if(s.step==='confirm'){
    if(n===1||/^(はい|合っています|あっています)[。！!\s]*$/.test(text)){
      if(!s.recipient||!s.companyConfirmed||!s.visitorConfirmed||!s.purpose)return advance(next(s));
      return {key:'guideComplete',state:{...s,step:'done'}};
    }
    if(n===2){delete s.recipient;delete s.recipientReading;delete s.staffId;return move('department');}
    if(n===3){delete s.company;s.companyConfirmed=false;return move('company');}
    if(n===4){delete s.visitor;s.visitorConfirmed=false;s.nameRetry=true;return move('visitorName');}
    if(n===5){delete s.purpose;return move(s.role==='delivery'?'deliveryType':'purposeChoice');}
    if(n===6)return move('route');return retry();
  }
  return retry();
}
