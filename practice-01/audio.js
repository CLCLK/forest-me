"use strict";

(() => {
  const music = document.getElementById("forest-bgm");
  const button = document.getElementById("bgm-toggle");
  const label = document.getElementById("bgm-label");
  const action = document.getElementById("bgm-action");
  music.volume = .4;

  function sync() {
    const playing = !music.paused;
    button.setAttribute("aria-pressed", String(playing));
    label.textContent = playing ? "BGM ON" : "BGM OFF";
    action.textContent = playing ? "음악 끄기" : "음악 켜기";
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (music.paused) await music.play();
      else music.pause();
      sync();
    } catch {
      document.getElementById("asset-status").textContent = "음악을 재생하지 못했어요. BGM 버튼을 다시 눌러주세요.";
      sync();
    } finally {
      button.disabled = false;
    }
  });
  music.addEventListener("play", sync);
  music.addEventListener("pause", sync);
})();
