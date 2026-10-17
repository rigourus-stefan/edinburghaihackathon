// Tiny in-memory, per-IP rate limiter. Each scan or story costs real money,
// so this stops a stuck frontend loop (or a curious judge) from burning the API budget.

export function rateLimit({ windowMs, max }) {
  const hits = new Map() // ip -> timestamps within the window

  setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [ip, times] of hits) {
      const recent = times.filter((t) => t > cutoff)
      if (recent.length) hits.set(ip, recent)
      else hits.delete(ip)
    }
  }, windowMs).unref()

  return (req, res, next) => {
    const now = Date.now()
    const recent = (hits.get(req.ip) ?? []).filter((t) => t > now - windowMs)
    if (recent.length >= max) {
      const retryAfter = Math.ceil((recent[0] + windowMs - now) / 1000)
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({ detail: `The book needs a breather. Try again in ${retryAfter} seconds.` })
    }
    recent.push(now)
    hits.set(req.ip, recent)
    next()
  }
}
