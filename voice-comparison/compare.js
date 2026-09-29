'use strict';
(() => {
  const player = document.querySelector('#player');
  const status = document.querySelector('#status');
  const stopButton = document.querySelector('#stop');
  const scenes = {
    startup: { title: '起動時の挨拶', text: '受付AIのつなぐです。受付で仕事をしながら、ご来客をお待ちしています。どうぞよろしくお願いします。' },
    route: { title: '番号での受付案内', text: 'ご用件を番号でお答えください。1番、弊社スタッフとお約束。2番、宅急便や納品など。3番、お約束なしのご来訪。' },
    confirm: { title: '受付内容の確認', text: '受付内容をご確認ください。1番、受付を完了。2番、担当者を訂正。3番、会社名を訂正。4番、お名前を訂正。5番、ご用件を訂正。6番、来訪の種類を訂正。' },
    goodbye: { title: 'お見送り', text: 'ありがとうございました。どうぞお気をつけてお帰りください。' },
  };
  const tracks = {
    original: { src: './audio/voicevox-startup.wav', label: '元の声（春日部つむぎ）', button: '元の声' },
    latest: { src: './audio/leda-startup.wav', label: 'Gemini 3.8の声（Leda）', button: 'Ledaの声' },
  };
  let active = null, request = 0, pending = false, failed = false;
  const clock = value => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';

  function paint() {
    for (const [id, track] of Object.entries(tracks)) {
      const card = document.querySelector(`[data-card="${id}"]`);
      const selected = id === active;
      const playing = selected && !player.paused && !player.ended;
      card.classList.toggle('is-playing', playing);
      const text = playing ? '一時停止' : '再生';
      const button = card.querySelector('[data-play]');
      button.textContent = `${playing ? 'Ⅱ' : '▶'} ${track.button}を${text}`;
      button.setAttribute('aria-label', `${track.button}を${text}`);
      card.querySelector('[data-state]').textContent = !selected ? '再生前' : failed ? '再生できません' : pending ? '読み込み中' : playing ? '再生中' : player.ended ? '再生終了' : player.currentTime > 0 ? '一時停止中' : '再生前';
      card.querySelector('[data-progress]').value = selected && player.duration ? player.currentTime / player.duration : 0;
      card.querySelector('[data-time]').textContent = selected && Number.isFinite(player.duration) ? `${clock(player.currentTime)} / ${clock(player.duration)}` : '0:00';
    }
    stopButton.disabled = !active;
  }

  async function play(id, restart = false) {
    const token = ++request;
    const same = active === id;
    if (same && !restart && !player.paused && !player.ended) {
      pending = false; player.pause(); status.textContent = `${tracks[id].label}を一時停止しました。`; paint(); return;
    }
    if (!same || restart || player.ended || failed) {
      player.pause(); player.src = tracks[id].src; player.currentTime = 0;
    }
    active = id; pending = true; failed = false;
    status.textContent = `${tracks[id].label}を読み込んでいます…`; paint();
    try {
      await player.play();
      if (token !== request) return;
      pending = false; status.textContent = `${tracks[id].label}を再生しています。`; paint();
    } catch (error) {
      if (token !== request) return;
      pending = false; failed = true;
      status.textContent = error.name === 'NotAllowedError'
        ? '再生ボタンをもう一度押してください。'
        : '音声を読み込めませんでした。通信環境を確認し、もう一度再生してください。';
      paint();
    }
  }

  function stop() {
    ++request; pending = false; failed = false; player.pause();
    player.removeAttribute('src'); player.load(); active = null;
    status.textContent = '停止しました。聞きたい声を選んでください。'; paint();
  }
  function selectScene(id) {
    if (!scenes[id]) return;
    stop();
    tracks.original.src = `./audio/voicevox-${id}.wav`;
    tracks.latest.src = `./audio/leda-${id}.wav`;
    document.querySelectorAll('[data-scene]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === id)));
    document.querySelectorAll('.script-label').forEach(label => { label.textContent = scenes[id].title; });
    document.querySelectorAll('blockquote').forEach(quote => { quote.textContent = scenes[id].text; });
    status.textContent = `「${scenes[id].title}」を選びました。聞きたい声の再生ボタンを押してください。`;
  }
  document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => selectScene(button.dataset.scene)));
  document.querySelectorAll('[data-play]').forEach(button => button.addEventListener('click', () => play(button.dataset.play)));
  document.querySelectorAll('[data-restart]').forEach(button => button.addEventListener('click', () => play(button.dataset.restart, true)));
  stopButton.addEventListener('click', stop);
  player.addEventListener('timeupdate', paint);
  player.addEventListener('loadedmetadata', paint);
  player.addEventListener('ended', () => {
    pending = false;
    if (active) status.textContent = `${tracks[active].label}の再生が終わりました。他の声もお試しください。`;
    paint();
  });
  window.addEventListener('pagehide', stop);
})();
