import { primeSpeechPlayer } from '../wide-desk-feedback/audio-access.mjs?v=20260915-mobile-audio-1';

const lines={
 startup:{title:'自己紹介',text:'受付AIのつなぐです。受付で仕事をしながら、ご来客をお待ちしています。どうぞよろしくお願いします。'},
 route:{title:'番号での受付案内',text:'ご用件を番号でお答えください。1番、弊社スタッフとお約束。2番、宅急便や納品など。3番、お約束なしのご来訪。'},
 confirm:{title:'受付内容の確認',text:'受付内容をご確認ください。1番、受付を完了。2番、担当者を訂正。3番、会社名を訂正。4番、お名前を訂正。5番、ご用件を訂正。6番、来訪の種類を訂正。'},
 goodbye:{title:'お見送り',text:'ありがとうございました。どうぞお気をつけてお帰りください。'}
};
const player=document.querySelector('#player'), status=document.querySelector('#status'), pose=document.querySelector('#pose');
const buttons=[...document.querySelectorAll('[data-line]')], stop=document.querySelector('#stop'), progress=document.querySelector('#progress');
let avatar, token=0, active=null, phase='loading', context, analyser, waveform, lipFrame=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function select(key){buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.line===key)));}
function stopMouth(){cancelAnimationFrame(lipFrame);avatar?.mouth(0);}
async function prepareMeter(){
 try {
  if(!context)context=new (window.AudioContext||window.webkitAudioContext)();
  await context.resume();
  if(context.state==='running'&&!analyser){analyser=context.createAnalyser();analyser.fftSize=512;waveform=new Uint8Array(analyser.fftSize);context.createMediaElementSource(player).connect(analyser);analyser.connect(context.destination);}
 }catch{/* Audio element still works without an analyser. */}
}
function animateMouth(){
 stopMouth();
 function step(){
  if(phase!=='speaking'||player.paused)return avatar?.mouth(0);
  let level=0;
  if(analyser){analyser.getByteTimeDomainData(waveform);for(const v of waveform)level+=((v-128)/128)**2;level=Math.sqrt(level/waveform.length);}
  else level=Math.sin(player.currentTime*23)>.1?.08:0;
  avatar.mouth(level);lipFrame=requestAnimationFrame(step);
 }step();
}
async function returnToWork(own,{bow=false}={}){
 phase='returning';stopMouth();
 if(bow){pose.textContent='お辞儀';avatar.motion('bow');await wait(avatar.duration('bow'));if(own!==token)return;}
 pose.textContent='着席中';avatar.motion('sitDown');await wait(avatar.duration('sitDown'));if(own!==token)return;
 avatar.motion('deskWork');phase='idle';pose.textContent='PC作業中';stop.disabled=true;select(null);
}
async function play(key){
 if(!avatar||!lines[key])return;
 const own=++token, wasStanding=phase==='speaking'||phase==='standing';
 player.onended=null;player.pause();stopMouth();active=key;select(key);stop.disabled=false;progress.value=0;
 document.querySelector('#line-title').textContent=lines[key].title;document.querySelector('#script').textContent=lines[key].text;
 status.textContent='立ち上がってご案内します…';pose.textContent='立ち上がり中';phase='preparing';
 // Unlock the same element directly within the click, before the standing animation.
 const unlock=primeSpeechPlayer(player);void prepareMeter();
 try{
  const unlocked=await unlock;if(own!==token)return;if(!unlocked)throw new Error('interrupted');
  if(!wasStanding){avatar.motion('standUp');await wait(avatar.duration('standUp'));if(own!==token)return;}
  avatar.motion('standIdle');phase='standing';
  player.src=`../voice-comparison/audio/leda-${key}.wav`;player.volume=1;
  player.onended=()=>{if(own!==token||phase!=='speaking')return;progress.value=1;status.textContent='再生が終わりました。ほかのセリフもお試しください。';void returnToWork(own,{bow:key==='goodbye'});};
  await player.play();if(own!==token)return;
  phase='speaking';pose.textContent='お話し中';status.textContent=`「${lines[key].title}」を再生しています。`;animateMouth();
 }catch(error){
  if(own!==token)return;player.pause();stopMouth();phase='standing';avatar.motion('standIdle');pose.textContent='再生待ち';
  status.textContent=error.name==='NotAllowedError'?'音声を開始できませんでした。同じボタンをもう一度押してください。':'音声を読み込めませんでした。通信環境を確認してボタンを押し直してください。';
 }
}
function cancel(){
 const own=++token;player.onended=null;player.pause();player.removeAttribute('src');player.load();stopMouth();active=null;select(null);progress.value=0;
 status.textContent='停止しました。セリフのボタンで再生できます。';stop.disabled=true;
 if(avatar)void returnToWork(own);
}
buttons.forEach(b=>b.addEventListener('click',()=>void play(b.dataset.line)));
stop.addEventListener('click',cancel);
player.addEventListener('timeupdate',()=>{if(phase==='speaking'&&player.duration)progress.value=player.currentTime/player.duration;});
player.addEventListener('waiting',()=>{if(phase==='speaking'){stopMouth();status.textContent='音声の読み込みを待っています…';}});
player.addEventListener('playing',()=>{if(phase==='speaking'){status.textContent=`「${lines[active].title}」を再生しています。`;animateMouth();}});
player.addEventListener('error',()=>{if(phase==='speaking'){cancel();status.textContent='音声の読み込みで問題が発生しました。もう一度お試しください。';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&avatar)cancel();});
window.addEventListener('pagehide',()=>{if(avatar)cancel();});
try{
 const {createAvatar}=await import('./avatar.js?v=1');
 avatar=await createAvatar(document.querySelector('#scene'),percent=>{document.querySelector('#load-detail').textContent=percent===null?'読み込み中…':`${percent}%`;});
 phase='idle';pose.textContent='PC作業中';document.querySelector('#loading').hidden=true;
 buttons.forEach(b=>b.disabled=false);select(null);status.textContent='準備できました。聞きたいセリフを押してください。';
}catch(error){console.error(error);document.querySelector('#loading strong').textContent='3Dモデルを読み込めませんでした';document.querySelector('#load-detail').textContent='通信環境・ブラウザの3D表示設定を確認し、ページを再読み込みしてください。';status.textContent='読み込みに失敗しました。ページを再読み込みしてください。';pose.textContent='読み込みエラー';}
