'use strict';
(() => {
  const voices = [
    { id:'leda', number:'01', name:'Leda', profile:'若々しい・高めの声が特徴の候補', src:'./audio/leda-startup.wav' },
    { id:'autonoe', number:'02', name:'Autonoe', profile:'明るい声が特徴の候補', src:'./audio/autonoe-startup.wav' },
    { id:'zephyr', number:'03', name:'Zephyr', profile:'明るく軽やかな印象を試す候補', src:'./audio/zephyr-startup.wav' },
    { id:'aoede', number:'04', name:'Aoede', profile:'さわやかで軽やかな声が特徴の候補', src:'./audio/aoede-startup.wav' },
    { id:'achernar-current', number:'05', name:'Achernar', profile:'比較用：Ledaに変更する前の声', src:'./audio/achernar-38-startup.wav', reference:true },
    { id:'achernar-trial', number:'06', name:'Achernar・高め', profile:'比較用：先ほどの若々しく高めに指定した試作', src:'./audio/achernar-38-youthful-trial.wav', reference:true },
  ];
  const player=document.querySelector('#player'), status=document.querySelector('#status'), stopButton=document.querySelector('#stop');
  const message=document.querySelector('#choice-message'), copyButton=document.querySelector('#copy-choice'), copyStatus=document.querySelector('#copy-status');
  const clearButton=document.querySelector('#clear-choice');
  const cards=new Map(); let active=null, pending=false, failed=false, request=0, choice=null;
  const el=(tag,className,text) => { const node=document.createElement(tag); if(className)node.className=className;if(text!==undefined)node.textContent=text;return node; };
  const label=v=>`候補${v.number} ${v.name}`;
  const time=n=>Number.isFinite(n)?`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`:'0:00';
  for(const v of voices){
    const card=el('article',`voice-card candidate${v.reference?' reference':''}`);card.dataset.voice=v.id;
    const top=el('div','card-top'), state=el('span','voice-state','再生前');top.append(el('span','voice-tag',`候補 ${v.number}${v.reference?' · 比較用':''}`),state);
    const heading=el('h3','',v.name),profile=el('p','profile',v.profile);
    const controls=el('div','playback'),play=el('button','play-button','▶ 再生'),restart=el('button','restart','↺ 最初から');
    play.type=restart.type='button';play.setAttribute('aria-label',`${label(v)}を再生`);restart.setAttribute('aria-label',`${label(v)}を最初から再生`);
    play.addEventListener('click',()=>playVoice(v));restart.addEventListener('click',()=>playVoice(v,true));controls.append(play,restart);
    const row=el('div','progress-row'),progress=el('progress'),duration=el('span','','0:00');progress.max=1;progress.value=0;progress.setAttribute('aria-label',`${label(v)}の再生位置`);row.append(progress,duration);
    const choose=el('button','choose','☆ この声が好き');choose.type='button';choose.setAttribute('aria-label',`${label(v)}を選ぶ`);choose.setAttribute('aria-pressed','false');choose.addEventListener('click',()=>select(v));
    card.append(top,heading,el('p','engine','Gemini 3.8 Flash TTS'),profile,controls,row,choose);document.querySelector('#candidates').append(card);
    cards.set(v.id,{card,state,play,progress,duration,choose});
  }
  function paint(){
    for(const v of voices){const c=cards.get(v.id),selected=active===v,playing=selected&&!player.paused&&!player.ended;
      c.card.classList.toggle('is-playing',playing);c.play.textContent=playing?'Ⅱ 一時停止':'▶ 再生';c.play.setAttribute('aria-label',`${label(v)}を${playing?'一時停止':'再生'}`);
      c.state.textContent=!selected?'再生前':failed?'再生エラー':pending?'読み込み中':playing?'再生中':player.ended?'再生終了':player.currentTime>0?'一時停止中':'再生前';
      c.progress.value=selected&&Number.isFinite(player.duration)&&player.duration>0?player.currentTime/player.duration:0;
      c.duration.textContent=selected&&Number.isFinite(player.duration)?`${time(player.currentTime)} / ${time(player.duration)}`:'0:00';
    }stopButton.disabled=!active;
  }
  async function playVoice(v,restart=false){
    const token=++request,same=active===v;
    if(same&&!restart&&!player.paused&&!player.ended){pending=false;player.pause();status.textContent=`${label(v)}を一時停止しました。`;paint();return;}
    if(!same||restart||player.ended||failed){player.pause();player.src=v.src;player.currentTime=0;}
    active=v;pending=true;failed=false;status.textContent=`${label(v)}を読み込んでいます…`;paint();
    try{await player.play();if(token!==request)return;pending=false;status.textContent=`${label(v)}を再生しています。`;paint();}
    catch(error){if(token!==request)return;pending=false;failed=true;status.textContent=error.name==='NotAllowedError'?'再生ボタンをもう一度押してください。':'音声を読み込めませんでした。通信環境を確認して再生し直してください。';paint();}
  }
  function stop(){++request;pending=false;failed=false;player.pause();player.removeAttribute('src');player.load();active=null;status.textContent='停止しました。別の候補も聞き比べてください。';paint();}
  function select(v){
    choice=v;for(const other of voices){const c=cards.get(other.id),selected=other===v;c.card.classList.toggle('selected',selected);c.choose.setAttribute('aria-pressed',String(selected));c.choose.textContent=selected?'★ この声を選択中':'☆ この声が好き';}
    message.value=`${label(v)}が一番良かったです。この声・話し方で、受付の4パターンを生成してください。`;
    document.querySelector('#choice-help').textContent=`${label(v)}を選びました。下の文章をコピーして、このチャットで教えてください。`;
    copyButton.disabled=false;clearButton.disabled=false;copyStatus.textContent='';try{localStorage.setItem('bst-voice-audition-choice-v1',v.id);}catch{}
  }
  clearButton.addEventListener('click',()=>{choice=null;for(const c of cards.values()){c.card.classList.remove('selected');c.choose.setAttribute('aria-pressed','false');c.choose.textContent='☆ この声が好き';}message.value='';copyButton.disabled=true;clearButton.disabled=true;copyStatus.textContent='選択を解除しました。';document.querySelector('#choice-help').textContent='各カードの「この声が好き」を押すと、下に伝える内容が表示されます。';try{localStorage.removeItem('bst-voice-audition-choice-v1');}catch{}});
  copyButton.addEventListener('click',async()=>{if(!choice)return;try{await navigator.clipboard.writeText(message.value);copyStatus.textContent='コピーしました。このチャットに貼り付けてください。';}catch{message.focus();message.select();copyStatus.textContent='文章を選択しました。手動でコピーしてお伝えください。';}});
  stopButton.addEventListener('click',stop);player.addEventListener('timeupdate',paint);player.addEventListener('loadedmetadata',paint);player.addEventListener('ended',()=>{pending=false;if(active)status.textContent=`${label(active)}の再生が終わりました。`;paint();});window.addEventListener('pagehide',stop);
  try{const saved=voices.find(v=>v.id===localStorage.getItem('bst-voice-audition-choice-v1'));if(saved)select(saved);}catch{}
})();
