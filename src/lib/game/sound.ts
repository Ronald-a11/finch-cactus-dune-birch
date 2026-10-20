let ctx: AudioContext | null = null;
let muted = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
}

export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
  if (!ctx || muted || ctx.state !== "running") return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function playPlace(mark: "X" | "O"): void {
  if (mark === "X") tone(540, 0.07, "square", 0.035);
  else tone(360, 0.09, "sine", 0.05);
}

export function playWin(): void {
  tone(440, 0.1, "triangle", 0.05);
  tone(660, 0.16, "triangle", 0.05, 0.09);
}

export function playDraw(): void {
  tone(196, 0.14, "sine", 0.04);
}
