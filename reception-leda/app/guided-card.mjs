import {choicesFor} from './guided-dialogue.mjs?v=20260921-kiosk-1';
export function createReceptionCard({onAnswer,onRestart}) {
  const panel=document.createElement('section');panel.className='guided-review';panel.hidden=true;
  panel.setAttribute('aria-label','受付内容の確認');panel.setAttribute('aria-live','polite');document.body.append(panel);
  let mode='',enabled=false,timer,hideTimer;
  const el=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
  function clear(){clearTimeout(timer);clearTimeout(hideTimer);mode='';panel.hidden=true;panel.classList.remove('is-fading');panel.replaceChildren();}
  function button(label,answer,host){const b=el('button',label);b.type='button';b.disabled=!enabled;b.dataset.answer=answer;b.onclick=()=>{if(enabled&&mode==='confirm')onAnswer(answer);};host.append(b);}
  return {
    get cueHost(){return mode==='confirm'?panel.querySelector('.guided-review-cue'):null;},
    get canConfirm(){return true;},
    show(state){
      if(state.step!=='confirm'){if(mode!=='complete')clear();return;}
      clear();mode='confirm';panel.hidden=false;
      panel.append(el('div','','guided-review-cue'),el('p','受付内容の確認・デモ','guided-kicker'),el('h2','こちらの内容でよろしいですか？'));
      const grid=el('dl','','guided-review-grid');
      const recipient=[state.department,state.recipientReading||state.recipient].filter(Boolean).join(' ／ ');
      for(const [label,value] of [['お呼びする担当者',recipient],['来訪者の会社名',state.company],['来訪者のお名前',state.visitor],['ご用件',state.purpose]]){
        const row=el('div','');row.append(el('dt',label),el('dd',value||'未確認',String(value||'').length>40?'is-long':''));grid.append(row);
      }
      const actions=el('div','','guided-review-actions');
      choicesFor(state).options.forEach(o=>button(o.value+' '+o.label,o.value,actions));
      panel.append(grid,el('p','番号でお答えください。ボタンでも選べます。','guided-review-hint'),actions,el('p','0 聞き直す　／　9 一つ前へ戻る　・　実際の電話や通知は行いません。','guided-review-note'));
    },
    setSpeaking(value){if(mode==='confirm')panel.querySelector('.guided-review-hint').textContent=value?'案内中です。ボタンは選べます。音声は緑のマイクのあとにお願いします。':'番号でお答えください。ボタンでも選べます。';},
    setEnabled(value){enabled=value;if(mode==='confirm')panel.querySelectorAll('button').forEach(b=>b.disabled=!value);},
    setRestartEnabled(value){const b=panel.querySelector('[data-restart]');if(b)b.disabled=!value;},
    complete(){
      clear();mode='complete';panel.hidden=false;
      panel.append(el('h2','ここまでが受付デモです'),el('p','ご協力ありがとうございました。'),el('p','実際の担当者への電話・通知は行っていません。'));
      const b=el('button','もう一度受付を試す');b.type='button';b.dataset.restart='';b.onclick=()=>{if(!b.disabled){b.disabled=true;onRestart();}};panel.append(b);
      timer=setTimeout(()=>{panel.classList.add('is-fading');hideTimer=setTimeout(clear,700);},5000);
    },clear,
  };
}
