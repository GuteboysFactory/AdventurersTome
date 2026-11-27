const ID = "adventurers-tome";
const directory = `modules/${ID}/assets/dice/`;
const recordings = ["roll-2.wav", "roll-3.wav", "roll-1.wav"];
const banks = new Map();
let localContext;
let unlockRegistered = false;

function audioContext() {
  return localContext ??= new AudioContext();
}

export function initializeDiceAudio() {
  if (unlockRegistered || !globalThis.AudioContext) return;
  unlockRegistered = true;
  const unlock = () => {
    if (!game.settings.get(ID, "diceSound")) return;
    void audioContext().resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, {passive: true});
  window.addEventListener("keydown", unlock, {passive: true});
  for (const recording of recordings) void loadBank(directory + recording);
  void loadBank(directory + "token.wav");
}

function loadBank(file) {
  if (!globalThis.AudioContext) return Promise.resolve(null);
  if (!banks.has(file)) {
    const route = /^(https?:\/\/|\/)/i.test(file) ? file : foundry.utils.getRoute(file);
    banks.set(file, fetch(route).then(response => response.ok ? response.arrayBuffer() : null)
      .then(bytes => bytes && audioContext().decodeAudioData(bytes)).catch(() => null));
  }
  return banks.get(file);
}

function play(file, gain, {offset = 0, duration, rate = 1, pan = 0} = {}) {
  if (localContext?.state !== "running" || gain <= 0) return;
  const requested = performance.now();
  void loadBank(file).then(buffer => {
    if (!buffer || performance.now() - requested > 120 || offset >= buffer.duration) return;
    const source = localContext.createBufferSource();
    const volume = localContext.createGain();
    const stereo = localContext.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    volume.gain.value = gain;
    stereo.pan.value = pan;
    source.connect(volume).connect(stereo).connect(localContext.destination);
    if (duration) source.start(0, offset, duration);
    else source.start(0, offset);
  }).catch(() => {});
}

export function primeVoices(group) {
  for (const file of voiceFiles(group)) void loadBank(file);
}

export function primeDiceReaction(file) {
  if (typeof file === "string" && file.trim()) void loadBank(file.trim());
}

function voiceFiles(group) {
  if (group !== "male" && group !== "female") return [];
  const suffix = group === "male" ? "Male" : "Female";
  return [directory + `voice-${group}-1.wav`,
    game.settings.get(ID, `diceVoice${suffix}2`),
    game.settings.get(ID, `diceVoice${suffix}3`)].filter(Boolean);
}

export function contactAudio(preferences, random) {
  const startedDice = new Set();
  let playedOccasionalVoice = false;
  return (contact, count) => {
    if (!preferences.sound) return;
    const interfaceVolume = game.settings.get("core", "globalInterfaceVolume");
    const volume = Number.isFinite(interfaceVolume) ? interfaceVolume : 1;
    const loudness = volume * (.15 + contact.power * .7) / Math.sqrt(Math.max(1, count / 2));
    const pan = (contact.index % 5 - 2) * .15;
    if (contact.kind === "token") {
      const choice = Math.floor(random() * 3);
      play(directory + "token.wav", loudness, {offset: choice * .12, duration: .12, pan});
      const customSound = typeof contact.sound === "string" ? contact.sound.trim() : "";
      const voices = contact.voice === "custom" && customSound ? [customSound] : voiceFiles(contact.voice);
      const occasional = preferences.voiceFrequency === "occasional" && !playedOccasionalVoice;
      if (voices.length && (preferences.voiceFrequency === "every" || occasional && random() < .105)) {
        playedOccasionalVoice = occasional;
        play(voices[Math.floor(random() * voices.length)], volume * .37, {pan});
      }
    } else if (!startedDice.has(contact.index)) {
      startedDice.add(contact.index);
      const recording = recordings[contact.index % recordings.length];
      play(directory + recording, loudness * .65, {pan});
    }
  };
}
