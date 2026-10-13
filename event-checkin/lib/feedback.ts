let ctx: AudioContext | null = null

function beep(freq: number, ms: number, when = 0) {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = freq; o.type = 'square'
    g.gain.value = 0.08
    o.connect(g); g.connect(ctx.destination)
    const t = ctx.currentTime + when
    o.start(t); o.stop(t + ms / 1000)
  } catch {}
}

export function signal(tone: 'ok' | 'warn' | 'bad', sound: boolean) {
  try { navigator.vibrate?.(tone === 'ok' ? 40 : tone === 'warn' ? [60, 40, 60] : [200]) } catch {}
  if (!sound) return
  if (tone === 'ok') beep(1100, 110)
  else if (tone === 'warn') { beep(700, 120); beep(700, 120, 0.18) }
  else { beep(220, 380) }
}
