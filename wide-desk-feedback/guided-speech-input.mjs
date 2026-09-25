// Explicit number phrases only: do not extract a digit from arbitrary sentences.
export function spokenNumber(input) {
  const text=String(input).normalize('NFKC').trim().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[。、,!?！？\s]+$/,'').replace(/^(?:えっと|えーと|あの)[、\s]*/,'');
  const m=text.match(/^(?:番号は|番号|なんばー)?\s*([0-9〇零一二三四五六七八九]|ぜろ|いち|に|さん|よん|し|ご|ろく|なな|しち|はち|きゅう)(?:\s*(?:番(?:目)?|ばん(?:め)?))?(?:を?選びます|がいいです|でいいです|にします|をお願いします|でお願いします|お願いします|です|で)?$/);
  const map={〇:0,零:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,ぜろ:0,ゼロ:0,いち:1,イチ:1,に:2,ニ:2,さん:3,サン:3,よん:4,ヨン:4,し:4,シ:4,ご:5,ゴ:5,ろく:6,ロク:6,なな:7,ナナ:7,しち:7,シチ:7,はち:8,ハチ:8,きゅう:9,キュウ:9};
  return m?(map[m[1]]??Number(m[1])):null;
}
export function selectSpeechAnswer(alternatives,info) {
  const candidates=alternatives.map(a=>String(a.transcript||'').trim()).filter(Boolean),text=candidates[0]||'';
  if(info.voiceField)return {text}; // Always confirm spoken names/companies.
  const allowed=new Set((info.options||[]).map(o=>o.value));
  const numbers=candidates.map(spokenNumber).filter(n=>n!==null&&(allowed.has(String(n))||n===0||n===9));
  const unique=[...new Set(numbers)],primary=spokenNumber(text);
  if(unique.length>1)return {text:'',unclear:true,heard:text};
  if(primary!==null&&!allowed.has(String(primary))&&![0,9].includes(primary))return {text,heard:text};
  return {text:unique.length===1?String(unique[0]):text,heard:text};
}
