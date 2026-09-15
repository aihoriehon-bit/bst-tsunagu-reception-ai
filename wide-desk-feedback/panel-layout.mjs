const KEY = 'tsunagu-conversation-panel-layout-v1';
export function fitPanelSize(width, height, viewportWidth, viewportHeight) {
  const maxWidth = Math.max(120, viewportWidth - 28), maxHeight = Math.max(80, viewportHeight - 70);
  return { width: Math.round(Math.min(maxWidth, Math.max(Math.min(260,maxWidth), width))),
    height: height == null ? null : Math.round(Math.min(maxHeight, Math.max(Math.min(160,maxHeight), height))) };
}
export function attachPanelLayout(panel) {
  let preference = {width:460,height:null,collapsed:false}, drag = null;
  try {
    const saved=JSON.parse(localStorage.getItem(KEY));
    if (saved && Number.isFinite(saved.width) && saved.width>0 && (saved.height===null || Number.isFinite(saved.height)&&saved.height>0)) {
      preference={width:Math.min(4000,saved.width),height:saved.height===null?null:Math.min(4000,saved.height),collapsed:saved.collapsed===true};
    }
  } catch { /* Optional browser preference. */ }
  const content=document.createElement('div');content.className='conversation-panel-content';
  while(panel.firstChild)content.append(panel.firstChild);
  content.id='conversationPanelContent';
  const bar=document.createElement('div');bar.className='conversation-panel-toolbar';
  const label=document.createElement('span');label.textContent='音声会話';bar.append(label);
  function button(text,title,action) {
    const el=document.createElement('button');el.type='button';el.textContent=text;el.title=title;el.setAttribute('aria-label',title);
    if(action)el.addEventListener('click',action);bar.append(el);return el;
  }
  button('小さく','会話パネルを小さくする',()=>{preference={width:320,height:240,collapsed:false};render();save();});
  button('戻す','会話パネルを元のサイズに戻す',()=>{preference={width:460,height:null,collapsed:false};render();save();});
  const fold=button('畳む','会話パネルを折りたたむ',()=>{preference.collapsed=!preference.collapsed;render();save();});
  fold.setAttribute('aria-controls',content.id);
  const handle=button('↗','会話パネルのサイズ変更：ドラッグ、または矢印キーで幅と高さを調整');handle.className='conversation-panel-resize';
  panel.classList.add('adjustable-conversation');panel.append(bar,content);
  function save(){try{localStorage.setItem(KEY,JSON.stringify(preference));}catch{/* Still usable without saving. */}}
  function render(){
    const size=fitPanelSize(preference.width,preference.height,window.innerWidth,window.innerHeight);
    panel.style.width=size.width+'px';panel.style.height=preference.collapsed||size.height===null?'auto':size.height+'px';
    content.hidden=preference.collapsed;fold.textContent=preference.collapsed?'開く':'畳む';
    fold.setAttribute('aria-expanded',String(!preference.collapsed));fold.setAttribute('aria-label',preference.collapsed?'会話パネルを開く':'会話パネルを折りたたむ');
    fold.title=fold.getAttribute('aria-label');
  }
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    preference.collapsed=false;render();
    const rect=panel.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height};
    handle.setPointerCapture(event.pointerId);event.preventDefault();
  });
  handle.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const size=fitPanelSize(drag.width+event.clientX-drag.x,drag.height-(event.clientY-drag.y),window.innerWidth,window.innerHeight);
    preference={...size,collapsed:false};render();
  });
  const finish=event=>{if(drag?.id!==event.pointerId)return;drag=null;save();};
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);handle.addEventListener('lostpointercapture',finish);
  handle.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();preference.collapsed=false;render();
    const rect=panel.getBoundingClientRect(),step=event.shiftKey?40:10;
    preference={...fitPanelSize(rect.width+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),rect.height+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0),window.innerWidth,window.innerHeight),collapsed:false};render();save();
  });
  // Keep the speaking/listening cue visible even when the contents are folded.
  const cue=content.querySelector('.turn-label');
  if(cue)new MutationObserver(()=>{label.textContent=cue.textContent||'音声会話';}).observe(cue,{childList:true,characterData:true,subtree:true});
  window.addEventListener('resize',render);render();
}
