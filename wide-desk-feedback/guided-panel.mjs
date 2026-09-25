import { choicesFor } from './guided-dialogue.mjs?v=20260921-kiosk-1';

export function createChoicePanel({ onAnswer }) {
  const panel=document.createElement('section');
  panel.className='guided-choices';panel.hidden=true;
  panel.setAttribute('aria-label','番号で進める受付');
  panel.innerHTML='<div class="guided-cue"></div><p class="guided-kicker">番号で進める受付・確認用デモ</p><h2></h2><p class="guided-hint"></p><p class="guided-sample" hidden>部署・担当者は動作確認用の仮の名簿です。</p><p class="guided-field-value" hidden></p><div class="guided-options"></div><p class="guided-heard" role="status"></p><div class="guided-navigation"></div>';
  document.body.append(panel);
  const q=s=>panel.querySelector(s);
  let state={}, enabled=false, signature='';
  function send(value) {if(enabled) onAnswer(value);}
  function button(label,value,host,number=null) {
    const el=document.createElement('button');el.type='button';
    if(number!==null){const badge=document.createElement('span');badge.className='guided-number';badge.textContent=String(number);el.append(badge);}
    const text=document.createElement('span');text.textContent=label;el.append(text);
    el.addEventListener('click',()=>send(value));host.append(el);
  }
  return {
    get cueHost(){return panel.hidden?null:q('.guided-cue');},
    get hasText(){return false;},
    setHeard(text,interim=false){q('.guided-heard').textContent=text?`${interim?'聞き取り中':'直前の聞き取り'}：${String(text).slice(0,100)}`:'';},
    show(value) {
      state=value;
      const info=choicesFor(state), nextSignature=JSON.stringify([state.step,state.role,state.departmentId,state.page,info.value,Boolean(state.history?.length)]);
      if(signature!==nextSignature){
        signature=nextSignature;q('h2').textContent=info.title;
        q('.guided-options').replaceChildren();q('.guided-navigation').replaceChildren();
        info.options.forEach(item=>button(item.label,item.value,q('.guided-options'),item.value));
        q('.guided-sample').hidden=!info.sample;
        q('.guided-field-value').hidden=!info.value;q('.guided-field-value').textContent=info.value||'';
        if(state.history?.length)button('9 戻る','9',q('.guided-navigation'));
        button('0 もう一度聞く','0',q('.guided-navigation'));
      }
    },
    setEnabled(value,speaking) {
      enabled=value;
      panel.hidden=!enabled || ['confirm','done','cancelled','finished'].includes(state.step) || !state.step;
      panel.querySelectorAll('button').forEach(el=>{el.disabled=!enabled;});
      // Buttons remain available during the guide; speech waits for listening.
      q('.guided-hint').textContent=speaking?'案内中です。音声は緑のマイクのあとにお願いします。':choicesFor(state).voiceField?'緑のマイクが出たら、ゆっくりお話しください。':'番号を話すか、ボタンを押してください。';
    },
    setCue(cue){
      panel.dataset.turn=cue.mode;
      q('.guided-hint').textContent=cue.mode==='speaking'?'案内中です。ボタンは今すぐ選べます。音声は緑のマイクが出てからお答えください。'
        :cue.mode==='listening'?(choicesFor(state).voiceField?'会社名・お名前は声でお伝えください。':'番号を話すか、ボタンを押してください。')
        :choicesFor(state).voiceField?'会社名・お名前はマイクが必要です。マイクを許可・再接続してください。':'マイクの準備前でもボタンで選べます。';
    },
    hide(){panel.hidden=true;enabled=false;signature='';},
  };
}
