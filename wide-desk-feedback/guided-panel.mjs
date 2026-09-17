import { choicesFor } from './guided-dialogue.mjs?v=20260917-choices-1';

export function createChoicePanel({ onAnswer }) {
  const panel=document.createElement('section');
  panel.className='guided-choices';panel.hidden=true;
  panel.setAttribute('aria-label','番号で進める受付');
  panel.innerHTML='<div class="guided-cue"></div><p class="guided-kicker">選択式の受付・確認用デモ</p><h2></h2><p class="guided-hint"></p><div class="guided-options"></div><form hidden><label></label><div><input maxlength="80" autocomplete="off"><button type="submit">送信</button></div></form><div class="guided-navigation"></div>';
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
  q('form').addEventListener('submit',e=>{e.preventDefault();const input=q('input');if(!enabled||!input.value.trim())return;const value=input.value;input.value='';send(value);});
  q('input').id='guidedTextInput';q('label').htmlFor='guidedTextInput';
  return {
    get cueHost(){return panel.hidden?null:q('.guided-cue');},
    get hasText(){return Boolean(q('input').value.trim());},
    show(value) {
      state=value;
      const info=choicesFor(state), nextSignature=JSON.stringify([state.step,state.role,Boolean(state.history?.length)]);
      if(signature!==nextSignature){
        signature=nextSignature;q('h2').textContent=info.title;
        q('.guided-options').replaceChildren();q('.guided-navigation').replaceChildren();
        info.options.forEach((item,index)=>button(item.label,item.value,q('.guided-options'),index+1));
        q('form').hidden=!info.input;q('input').value='';q('label').textContent=state.step==='purpose'?'文字でご用件を入力':'文字でお名前を入力';
        q('input').placeholder=state.step==='purpose'?'例：設備の相談です':'例：やまだたろう';
        if(info.general)button('分からない・総務へ','総務',q('.guided-navigation'));
        if(state.history?.length)button('戻る','戻る',q('.guided-navigation'));
        button('もう一度聞く','もう一度',q('.guided-navigation'));
      }
    },
    setEnabled(value,speaking) {
      enabled=value;
      panel.hidden=!enabled || ['confirm','done','cancelled','finished'].includes(state.step) || !state.step;
      panel.querySelectorAll('button,input').forEach(el=>{el.disabled=!enabled;});
      // Buttons remain available during the guide; speech waits for listening.
      q('.guided-hint').textContent=speaking?'案内中です。ボタンは今すぐ選べます。音声は緑のマイクが出てからお答えください。':choicesFor(state).input?'音声または文字でお答えください。':'番号を話すか、ボタンを押してください。';
    },
    setCue(cue){
      panel.dataset.turn=cue.mode;
      q('.guided-hint').textContent=cue.mode==='speaking'?'案内中です。ボタンは今すぐ選べます。音声は緑のマイクが出てからお答えください。'
        :cue.mode==='listening'?(choicesFor(state).input?'音声または文字でお答えください。':'番号を話すか、ボタンを押してください。')
        :'音声の準備ができていなくても、ボタンや文字入力で進められます。';
    },
    hide(){panel.hidden=true;enabled=false;signature='';},
  };
}
