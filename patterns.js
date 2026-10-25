// Candlestick pattern library: the patterns from the classic cheat sheet, the rules used to find them
// on real candles, SVG drawings for the handbook, and the KLineChart indicator that highlights them.
const Patterns = (() => {
  const GREEN = '#0ecb81', RED = '#f6465d', GREY = '#c9a227';
  const BIAS_COLOR = { bull: GREEN, bear: RED, neutral: GREY };

  // Drawings use [open, high, low, close] on a 0-100 scale. D/U are faded trend candles drawn before
  // the pattern so you can see the trend it appears in.
  const D = [[80, 83, 68, 71], [71, 74, 60, 62], [62, 65, 51, 53]];
  const U = [[20, 32, 17, 29], [29, 40, 26, 38], [38, 49, 35, 47]];

  // ---------- detection helpers ----------
  const isDoji = (k, ar) => k.range > 0 && k.body <= 0.1 * k.range && k.range >= 0.3 * ar;
  const long = (k, ab) => k.body >= ab && k.body >= 0.5 * k.range;
  const spin = (k, ar) => k.body > 0.1 * k.range && k.body <= 0.33 * k.range && k.up >= 0.25 * k.range && k.lo >= 0.25 * k.range && k.range >= 0.5 * ar;
  const hammerShape = (k, ar) => k.lo >= 2 * k.body && k.lo >= 0.6 * k.range && k.up <= 0.15 * k.range && k.body > 0.05 * k.range && k.range >= 0.8 * ar;
  const invShape = (k, ar) => k.up >= 2 * k.body && k.up >= 0.6 * k.range && k.lo <= 0.15 * k.range && k.body > 0.05 * k.range && k.range >= 0.8 * ar;
  const inside = (k, p) => k.top <= p.top && k.bot >= p.bot && k.body <= 0.5 * p.body;
  const soldier = (k, ab) => k.bull && k.body >= 0.6 * k.range && k.body >= 0.7 * ab && k.up <= 0.3 * k.body;
  const crow = (k, ab) => k.bear && k.body >= 0.6 * k.range && k.body >= 0.7 * ab && k.lo <= 0.3 * k.body;

  // Each test gets (bars, i, x): bars[i] is the pattern's LAST candle. x.ab/x.ar = average body/range of the
  // 14 candles before it, x.tr = the trend going into the pattern ('up' | 'down' | null).
  const DEFS = [
    // ----- neutral -----
    {
      id: 'doji', name: 'Doji', short: 'Doji', bias: 'neutral', group: 'neutral', n: 1, noisy: true, strength: 1,
      draw: [[50, 62, 38, 50.4]],
      looks: 'Open and close are (almost) the same price, so the body is a thin line. Wicks can be any length.',
      means: 'Buyers and sellers ended the candle in a tie: indecision. On its own it predicts nothing; it matters when it shows up after a strong move, where it can be the first sign that move is running out of steam.',
      trade: 'Never trade a doji alone. Wait for the next candle: a strong close above the doji high leans bullish, below the doji low leans bearish.',
      rule: 'Body is 10% or less of the candle\'s full high-to-low range.',
      test: (b, i, x) => isDoji(b[i], x.ar) && !(b[i].up >= 0.3 * b[i].range && b[i].lo >= 0.3 * b[i].range && b[i].range >= 1.3 * x.ar) && b[i].up > 0.1 * b[i].range && b[i].lo > 0.1 * b[i].range,
    },
    {
      id: 'longdoji', name: 'Long-Legged Doji', short: 'LL Doji', bias: 'neutral', group: 'neutral', n: 1, noisy: true, strength: 1,
      draw: [[50, 76, 24, 50.4]],
      looks: 'A doji with long wicks on both sides: price swung far up AND far down, then closed where it opened.',
      means: 'Big fight, no winner. More dramatic indecision than a normal doji, often seen near tops and bottoms when the market is unsure.',
      trade: 'Treat it as a warning, not a signal. Mark its high and low; a break of either side shows who won.',
      rule: 'Doji whose upper and lower wicks are each at least 30% of the range, and the candle is 1.3x bigger than average.',
      test: (b, i, x) => isDoji(b[i], x.ar) && b[i].up >= 0.3 * b[i].range && b[i].lo >= 0.3 * b[i].range && b[i].range >= 1.3 * x.ar,
    },
    {
      id: 'highwave', name: 'High Wave', short: 'High Wave', bias: 'neutral', group: 'neutral', n: 1, noisy: true, strength: 1,
      draw: [[47, 78, 22, 53]],
      looks: 'A small body with VERY long wicks on both sides, on a candle much bigger than usual.',
      means: 'Wild swings both ways with no winner: the market has lost its sense of direction. Often seen near turning points.',
      trade: 'A warning, not a signal. Wait for a candle to close beyond its high or low.',
      rule: 'Body 10-25% of the range, both wicks at least 35% of the range, candle at least 1.5x the average size.',
      test: (b, i, x) => { const k = b[i]; return k.body > 0.1 * k.range && k.body <= 0.25 * k.range && k.up >= 0.35 * k.range && k.lo >= 0.35 * k.range && k.range >= 1.5 * x.ar; },
    },
    {
      id: 'spin', name: 'Spinning Top', short: 'Spin', bias: 'neutral', group: 'neutral', n: 1, noisy: true, strength: 1,
      draw: [[47, 63, 37, 53]],
      looks: 'Small body in the middle, with upper and lower wicks of similar size.',
      means: 'Indecision, a bit weaker than a doji. Neither side could push price away from the open.',
      trade: 'Mostly noise in a range. Only interesting after a strong trend (see the bullish/bearish versions).',
      rule: 'Body between 10% and 33% of the range, each wick at least 25% of the range, no clear trend before it.',
      test: (b, i, x) => spin(b[i], x.ar) && !x.tr,
    },
    // ----- single, bullish -----
    {
      id: 'hammer', name: 'Hammer', short: 'Hammer', bias: 'bull', group: 'single', n: 1, ctx: 'down', strength: 2,
      draw: [[46, 51, 30, 50]],
      looks: 'Small body at the TOP of the candle with a long lower wick (at least 2x the body) and little or no upper wick. Appears after a drop.',
      means: 'Sellers pushed price far down, but buyers pushed it all the way back up before the close. Selling pressure may be exhausted.',
      trade: 'Wait for confirmation: the next candle closing above the hammer\'s high. A common stop goes just below the hammer\'s low.',
      rule: 'Downtrend before it; lower wick at least 2x the body and 60% of the range; upper wick 15% of the range or less.',
      test: (b, i, x) => x.tr === 'down' && hammerShape(b[i], x.ar),
    },
    {
      id: 'invhammer', name: 'Inverted Hammer', short: 'Inv Hammer', bias: 'bull', group: 'single', n: 1, ctx: 'down', strength: 1,
      draw: [[46, 66, 45, 49]],
      looks: 'Small body at the BOTTOM with a long upper wick and little or no lower wick. Appears after a drop.',
      means: 'Buyers tried to push up and got pushed back, but the fact they tried after a selloff hints the selling is fading.',
      trade: 'Weaker than a hammer: needs the next candle to close above the inverted hammer\'s body (ideally its high).',
      rule: 'Downtrend before it; upper wick at least 2x the body and 60% of the range; lower wick 15% of the range or less.',
      test: (b, i, x) => x.tr === 'down' && invShape(b[i], x.ar),
    },
    {
      id: 'dragonfly', name: 'Dragonfly Doji', short: 'Dragonfly', bias: 'bull', group: 'single', n: 1, ctx: 'down', strength: 2,
      draw: [[50, 50.6, 31, 50.3]],
      looks: 'A "T" shape: open, high and close all at the top, with a long lower wick. Appears after a drop.',
      means: 'Sellers drove price way down, buyers took it all back. Like a hammer, but even more balanced.',
      trade: 'Confirm with a bullish candle next. Stop below the dragonfly\'s low.',
      rule: 'Downtrend before it; doji with an upper wick of 10% of the range or less and a lower wick of 60% or more.',
      test: (b, i, x) => x.tr === 'down' && isDoji(b[i], x.ar) && b[i].up <= 0.1 * b[i].range && b[i].lo >= 0.6 * b[i].range,
    },
    {
      id: 'bullspin', name: 'Bullish Spinning Top', short: 'Bull Spin', bias: 'bull', group: 'single', n: 1, ctx: 'down', noisy: true, strength: 1,
      draw: [[47, 57, 41, 51]],
      looks: 'A spinning top (small body, wicks on both sides) that appears after a drop.',
      means: 'The selling has slowed into indecision. A possible pause or turn, but weak on its own.',
      trade: 'Only act if the next candle closes strongly up. Otherwise ignore.',
      rule: 'Spinning-top shape with a downtrend before it.',
      test: (b, i, x) => x.tr === 'down' && spin(b[i], x.ar),
    },
    {
      id: 'bullmaru', name: 'Bullish Marubozu', short: 'Bull Maru', bias: 'bull', group: 'single', n: 1, strength: 2,
      draw: [[50, 78.3, 49.7, 78]],
      looks: 'A big green candle with no (or tiny) wicks: it opened at the low and closed at the high.',
      means: 'Buyers were in control from the first second to the last. Strong momentum, often continues.',
      trade: 'Signals strength. Many traders wait for a small pullback into the candle\'s body rather than chasing the close.',
      rule: 'Green candle whose body is 90%+ of its range and at least 1.5x the average body size.',
      test: (b, i, x) => b[i].bull && b[i].body >= 0.9 * b[i].range && b[i].body >= 1.5 * x.ab,
    },
    // ----- single, bearish -----
    {
      id: 'shootingstar', name: 'Shooting Star', short: 'Shoot Star', bias: 'bear', group: 'single', n: 1, ctx: 'up', strength: 2,
      draw: [[50, 68, 46, 47]],
      looks: 'Small body at the BOTTOM with a long upper wick and little or no lower wick. Appears after a rise.',
      means: 'Buyers pushed price up, then sellers slammed it back down before the close. The rally may be exhausted.',
      trade: 'Confirm with the next candle closing below the shooting star\'s low. Stop just above its high.',
      rule: 'Uptrend before it; upper wick at least 2x the body and 60% of the range; lower wick 15% of the range or less.',
      test: (b, i, x) => x.tr === 'up' && invShape(b[i], x.ar),
    },
    {
      id: 'hangingman', name: 'Hanging Man', short: 'Hang Man', bias: 'bear', group: 'single', n: 1, ctx: 'up', strength: 1,
      draw: [[50, 54, 33, 53]],
      looks: 'Same shape as a hammer (small body on top, long lower wick) but it appears after a RISE.',
      means: 'Sellers managed a big dip during the candle. Buyers recovered it, but the dip shows cracks in the uptrend.',
      trade: 'Weak alone. Needs a bearish candle closing below the hanging man\'s body to confirm.',
      rule: 'Uptrend before it; same shape rules as the hammer.',
      test: (b, i, x) => x.tr === 'up' && hammerShape(b[i], x.ar),
    },
    {
      id: 'gravestone', name: 'Gravestone Doji', short: 'Gravestone', bias: 'bear', group: 'single', n: 1, ctx: 'up', strength: 2,
      draw: [[50, 69, 49.5, 49.7]],
      looks: 'An upside-down "T": open, low and close all at the bottom, with a long upper wick. Appears after a rise.',
      means: 'Buyers pushed up hard and lost all of it. A strong rejection of higher prices.',
      trade: 'Confirm with a bearish candle next. Stop above the gravestone\'s high.',
      rule: 'Uptrend before it; doji with a lower wick of 10% of the range or less and an upper wick of 60% or more.',
      test: (b, i, x) => x.tr === 'up' && isDoji(b[i], x.ar) && b[i].lo <= 0.1 * b[i].range && b[i].up >= 0.6 * b[i].range,
    },
    {
      id: 'bearspin', name: 'Bearish Spinning Top', short: 'Bear Spin', bias: 'bear', group: 'single', n: 1, ctx: 'up', noisy: true, strength: 1,
      draw: [[53, 59, 43, 49]],
      looks: 'A spinning top (small body, wicks on both sides) that appears after a rise.',
      means: 'The buying has slowed into indecision. A possible pause or top, but weak on its own.',
      trade: 'Only act if the next candle closes strongly down. Otherwise ignore.',
      rule: 'Spinning-top shape with an uptrend before it.',
      test: (b, i, x) => x.tr === 'up' && spin(b[i], x.ar),
    },
    {
      id: 'bearmaru', name: 'Bearish Marubozu', short: 'Bear Maru', bias: 'bear', group: 'single', n: 1, strength: 2,
      draw: [[50, 50.3, 22.7, 23]],
      looks: 'A big red candle with no (or tiny) wicks: it opened at the high and closed at the low.',
      means: 'Sellers were in control the whole time. Strong downward momentum, often continues.',
      trade: 'Signals weakness. Many traders wait for a bounce into the candle\'s body before shorting.',
      rule: 'Red candle whose body is 90%+ of its range and at least 1.5x the average body size.',
      test: (b, i, x) => b[i].bear && b[i].body >= 0.9 * b[i].range && b[i].body >= 1.5 * x.ab,
    },
    // ----- double, bullish -----
    {
      id: 'bullkicker', name: 'Bullish Kicker', short: 'Bull Kick', bias: 'bull', group: 'double', n: 2, ctx: 'down', strength: 3,
      draw: [[54, 55, 40, 41], [56, 73, 55, 72]],
      looks: 'A strong red candle, then a strong green candle that opens at or ABOVE the red candle\'s open and keeps rising.',
      means: 'A sudden, complete change of mood: sellers were in charge, then buyers took over instantly. One of the strongest reversal signals.',
      trade: 'Strong on its own. Stop below the green candle\'s low. True gaps are rare in 24/7 crypto, so kickers are uncommon.',
      rule: 'Long red candle, then a long green candle opening at or above the red candle\'s open.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return p.bear && long(p, x.ab) && k.bull && long(k, x.ab) && k.o >= p.o; },
    },
    {
      id: 'bullengulf', name: 'Bullish Engulfing', short: 'Bull Engulf', bias: 'bull', group: 'double', n: 2, ctx: 'down', strength: 2,
      draw: [[52, 53, 44, 45], [43, 59, 42, 58]],
      looks: 'A red candle followed by a bigger green candle whose body completely covers ("engulfs") the red body. Appears after a drop.',
      means: 'Buyers overpowered all of the previous candle\'s selling in one go. A classic reversal sign.',
      trade: 'Enter on the close or on a small dip; stop below the green candle\'s low. Stronger at support and with high volume.',
      rule: 'Downtrend before it; red candle, then a green candle opening at/below the red close and closing at/above the red open.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'down' && p.bear && k.bull && k.c >= p.o && k.o <= p.c && k.body > 1.05 * p.body && p.body >= 0.3 * x.ab; },
    },
    {
      id: 'bullharami', name: 'Bullish Harami', short: 'Bull Harami', bias: 'bull', group: 'double', n: 2, ctx: 'down', strength: 1,
      draw: [[56, 57, 36, 37], [42, 48, 40, 47]],
      looks: 'A big red candle followed by a small candle whose body fits INSIDE the red body ("harami" means pregnant).',
      means: 'The selling suddenly shrank. Momentum is slowing; a reversal may follow.',
      trade: 'Weak alone. Wait for a close above the big red candle\'s open (that makes it a "Three Inside Up").',
      rule: 'Downtrend before it; long red candle, then a candle whose body sits inside it and is half its size or less.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'down' && p.bear && long(p, x.ab) && inside(k, p); },
    },
    {
      id: 'piercing', name: 'Piercing Line', short: 'Piercing', bias: 'bull', group: 'double', n: 2, ctx: 'down', strength: 2,
      draw: [[56, 57, 40, 41], [39, 52, 38, 51]],
      looks: 'A long red candle, then a green candle that opens at/below the red close and closes ABOVE the middle of the red body.',
      means: 'Buyers won back more than half of the previous candle\'s loss. A reversal sign, a little weaker than an engulfing.',
      trade: 'Confirm with the next candle holding above the midpoint. Stop below the pattern\'s low.',
      rule: 'Downtrend before it; long red candle; green candle opens at/below its close and closes above its midpoint but below its open.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'down' && p.bear && long(p, x.ab) && k.bull && k.o <= p.c + 0.1 * p.body && k.c > p.c + 0.5 * p.body && k.c < p.o; },
    },
    {
      id: 'tweezerbottom', name: 'Tweezer Bottom', short: 'Tweezer Bot', bias: 'bull', group: 'double', n: 2, ctx: 'down', strength: 1,
      draw: [[52, 53, 38, 41], [41, 52, 38, 51]],
      looks: 'Two candles with (almost) the same LOW: a red one, then a green one. Like the two tips of tweezers.',
      means: 'Price tested the same low twice and buyers defended it both times: a small support level.',
      trade: 'Stop just below the shared low. Stronger when the lows line up with a known support area.',
      rule: 'Downtrend before it; red then green candle whose lows are within 10% of an average candle of each other.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'down' && p.bear && k.bull && Math.abs(p.l - k.l) <= 0.1 * x.ar && p.body >= 0.5 * x.ab && k.body >= 0.5 * x.ab; },
    },
    // ----- double, bearish -----
    {
      id: 'bearkicker', name: 'Bearish Kicker', short: 'Bear Kick', bias: 'bear', group: 'double', n: 2, ctx: 'up', strength: 3,
      draw: [[46, 60, 45, 59], [44, 45, 30, 31]],
      looks: 'A strong green candle, then a strong red candle that opens at or BELOW the green candle\'s open and keeps falling.',
      means: 'An instant flip from buyers to sellers. One of the strongest bearish reversal signals.',
      trade: 'Strong on its own. Stop above the red candle\'s high. Rare in 24/7 crypto.',
      rule: 'Long green candle, then a long red candle opening at or below the green candle\'s open.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return p.bull && long(p, x.ab) && k.bear && long(k, x.ab) && k.o <= p.o; },
    },
    {
      id: 'bearengulf', name: 'Bearish Engulfing', short: 'Bear Engulf', bias: 'bear', group: 'double', n: 2, ctx: 'up', strength: 2,
      draw: [[48, 56, 47, 55], [57, 58, 42, 43]],
      looks: 'A green candle followed by a bigger red candle whose body completely covers the green body. Appears after a rise.',
      means: 'Sellers wiped out all of the previous candle\'s buying in one go. A classic top signal.',
      trade: 'Enter on the close or a small bounce; stop above the red candle\'s high. Stronger at resistance.',
      rule: 'Uptrend before it; green candle, then a red candle opening at/above the green close and closing at/below the green open.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'up' && p.bull && k.bear && k.c <= p.o && k.o >= p.c && k.body > 1.05 * p.body && p.body >= 0.3 * x.ab; },
    },
    {
      id: 'bearharami', name: 'Bearish Harami', short: 'Bear Harami', bias: 'bear', group: 'double', n: 2, ctx: 'up', strength: 1,
      draw: [[44, 64, 43, 63], [58, 60, 52, 53]],
      looks: 'A big green candle followed by a small candle whose body fits INSIDE the green body.',
      means: 'The buying suddenly shrank. Momentum is fading; a top may form.',
      trade: 'Weak alone. Wait for a close below the big green candle\'s open (a "Three Inside Down").',
      rule: 'Uptrend before it; long green candle, then a candle whose body sits inside it and is half its size or less.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'up' && p.bull && long(p, x.ab) && inside(k, p); },
    },
    {
      id: 'darkcloud', name: 'Dark Cloud Cover', short: 'Dark Cloud', bias: 'bear', group: 'double', n: 2, ctx: 'up', strength: 2,
      draw: [[45, 61, 44, 60], [62, 63, 49, 50]],
      looks: 'A long green candle, then a red candle that opens at/above the green close and closes BELOW the middle of the green body.',
      means: 'Sellers took back more than half of the previous candle\'s gain. The mirror of the piercing line.',
      trade: 'Confirm with the next candle staying below the midpoint. Stop above the pattern\'s high.',
      rule: 'Uptrend before it; long green candle; red candle opens at/above its close and closes below its midpoint but above its open.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'up' && p.bull && long(p, x.ab) && k.bear && k.o >= p.c - 0.1 * p.body && k.c < p.c - 0.5 * p.body && k.c > p.o; },
    },
    {
      id: 'tweezertop', name: 'Tweezer Top', short: 'Tweezer Top', bias: 'bear', group: 'double', n: 2, ctx: 'up', strength: 1,
      draw: [[48, 62, 47, 60], [59, 62, 48, 49]],
      looks: 'Two candles with (almost) the same HIGH: a green one, then a red one.',
      means: 'Price hit the same high twice and sellers rejected it both times: a small resistance level.',
      trade: 'Stop just above the shared high. Stronger at a known resistance area.',
      rule: 'Uptrend before it; green then red candle whose highs are within 10% of an average candle of each other.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'up' && p.bull && k.bear && Math.abs(p.h - k.h) <= 0.1 * x.ar && p.body >= 0.5 * x.ab && k.body >= 0.5 * x.ab; },
    },
    // ----- triple, bullish -----
    {
      id: 'babybull', name: 'Bullish Abandoned Baby', short: 'Aband Baby', bias: 'bull', group: 'triple', n: 3, ctx: 'down', strength: 3,
      draw: [[56, 57, 40, 41], [35, 38, 32, 35.2], [42, 58, 41, 57]],
      looks: 'Long red candle, then a doji that sits completely BELOW it (a gap), then a green candle that gaps back up.',
      means: 'The doji is "abandoned" on its own island: a very strong bottom. Extremely rare in crypto because markets never close.',
      trade: 'Strong signal; stop below the doji\'s low.',
      rule: 'Downtrend; long red candle; a doji whose high is below the lows of both neighbours; then a green candle.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'down' && a.bear && long(a, x.ab) && isDoji(m, x.ar) && m.h < a.l && m.h < c.l && c.bull; },
    },
    {
      id: 'morningdoji', name: 'Morning Doji Star', short: 'AM Doji Star', bias: 'bull', group: 'triple', n: 3, ctx: 'down', strength: 3,
      draw: [[56, 57, 40, 41], [38, 41, 35, 38.2], [40, 56, 39, 55]],
      looks: 'Long red candle, a DOJI at the bottom, then a long green candle closing past the middle of the red one.',
      means: 'Selling, then a complete stall (doji), then buyers take over. A strong three-step bottom.',
      trade: 'Stop below the doji\'s low. Often a better entry than a single hammer because it already includes confirmation.',
      rule: 'Downtrend; long red candle; doji at or below its close; green candle closing above the red candle\'s midpoint.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'down' && a.bear && long(a, x.ab) && isDoji(m, x.ar) && m.top <= a.c + 0.1 * a.body && c.bull && c.c >= a.c + 0.5 * a.body; },
    },
    {
      id: 'morningstar', name: 'Morning Star', short: 'Morning Star', bias: 'bull', group: 'triple', n: 3, ctx: 'down', strength: 3,
      draw: [[56, 57, 40, 41], [38, 41, 33, 36], [40, 56, 39, 55]],
      looks: 'Long red candle, a SMALL-bodied candle at the bottom (the "star"), then a long green candle closing past the middle of the red one.',
      means: 'Sellers, then indecision, then buyers. Like the sun rising after night: a reliable bottom pattern.',
      trade: 'Enter after the third candle; stop below the star\'s low.',
      rule: 'Downtrend; long red candle; a small body (30% of the red body or less) at/below its close; green candle closing above the red midpoint.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'down' && a.bear && long(a, x.ab) && !isDoji(m, x.ar) && m.body <= 0.3 * a.body && m.top <= a.c + 0.1 * a.body && c.bull && c.c >= a.c + 0.5 * a.body; },
    },
    {
      id: 'soldiers', name: 'Three White Soldiers', short: '3 Soldiers', bias: 'bull', group: 'triple', n: 3, strength: 2,
      draw: [[40, 47, 39, 46], [44, 53, 43, 52], [50, 60, 49, 59]],
      looks: 'Three long green candles in a row, each opening inside the previous body and closing higher, with small upper wicks.',
      means: 'Steady, determined buying over three candles. Strong bullish momentum.',
      trade: 'Often marks the start of a move up, but after a long rally it can mean buyers are exhausted. A pullback entry is safer than chasing.',
      rule: 'Three green candles with big bodies (60%+ of range), each closing higher and opening inside the prior body; small upper wicks.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return soldier(a, x.ab) && soldier(m, x.ab) && soldier(c, x.ab) && m.c > a.c && c.c > m.c && m.o >= a.o && m.o <= a.c && c.o >= m.o && c.o <= m.c; },
    },
    // ----- triple, bearish -----
    {
      id: 'babybear', name: 'Bearish Abandoned Baby', short: 'Aband Baby', bias: 'bear', group: 'triple', n: 3, ctx: 'up', strength: 3,
      draw: [[44, 60, 43, 59], [65, 68, 62, 65.2], [58, 59, 42, 43]],
      looks: 'Long green candle, then a doji completely ABOVE it (a gap), then a red candle that gaps back down.',
      means: 'A very strong top: the doji is left alone on an island. Extremely rare in crypto.',
      trade: 'Strong signal; stop above the doji\'s high.',
      rule: 'Uptrend; long green candle; a doji whose low is above the highs of both neighbours; then a red candle.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'up' && a.bull && long(a, x.ab) && isDoji(m, x.ar) && m.l > a.h && m.l > c.h && c.bear; },
    },
    {
      id: 'eveningdoji', name: 'Evening Doji Star', short: 'PM Doji Star', bias: 'bear', group: 'triple', n: 3, ctx: 'up', strength: 3,
      draw: [[44, 60, 43, 59], [62, 65, 59, 61.8], [60, 61, 44, 45]],
      looks: 'Long green candle, a DOJI at the top, then a long red candle closing past the middle of the green one.',
      means: 'Buying, a complete stall, then sellers take over. A strong three-step top.',
      trade: 'Stop above the doji\'s high.',
      rule: 'Uptrend; long green candle; doji at or above its close; red candle closing below the green candle\'s midpoint.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'up' && a.bull && long(a, x.ab) && isDoji(m, x.ar) && m.bot >= a.c - 0.1 * a.body && c.bear && c.c <= a.c - 0.5 * a.body; },
    },
    {
      id: 'eveningstar', name: 'Evening Star', short: 'Evening Star', bias: 'bear', group: 'triple', n: 3, ctx: 'up', strength: 3,
      draw: [[44, 60, 43, 59], [62, 67, 60, 64], [60, 61, 44, 45]],
      looks: 'Long green candle, a SMALL-bodied candle at the top, then a long red candle closing past the middle of the green one.',
      means: 'Buyers, then indecision, then sellers: night falling after the day. A reliable top pattern.',
      trade: 'Enter after the third candle; stop above the star\'s high.',
      rule: 'Uptrend; long green candle; a small body (30% of the green body or less) at/above its close; red candle closing below the green midpoint.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'up' && a.bull && long(a, x.ab) && !isDoji(m, x.ar) && m.body <= 0.3 * a.body && m.bot >= a.c - 0.1 * a.body && c.bear && c.c <= a.c - 0.5 * a.body; },
    },
    {
      id: 'crows', name: 'Three Black Crows', short: '3 Crows', bias: 'bear', group: 'triple', n: 3, strength: 2,
      draw: [[60, 61, 53, 54], [56, 57, 47, 48], [50, 51, 40, 41]],
      looks: 'Three long red candles in a row, each opening inside the previous body and closing lower, with small lower wicks.',
      means: 'Steady, determined selling over three candles. Strong bearish momentum.',
      trade: 'Often the start of a move down, but after a long drop sellers may be exhausted. A bounce entry is safer than chasing.',
      rule: 'Three red candles with big bodies (60%+ of range), each closing lower and opening inside the prior body; small lower wicks.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return crow(a, x.ab) && crow(m, x.ab) && crow(c, x.ab) && m.c < a.c && c.c < m.c && m.o <= a.o && m.o >= a.c && c.o <= m.o && c.o >= m.c; },
    },
    // ----- confirmation -----
    {
      id: 'insideup', name: 'Three Inside Up', short: '3 Inside Up', bias: 'bull', group: 'confirm', n: 3, ctx: 'down', strength: 3,
      draw: [[58, 59, 40, 41], [44, 52, 43, 51], [50, 62, 49, 61]],
      looks: 'A Bullish Harami (big red + small candle inside it) followed by a green candle that closes ABOVE the big red candle\'s open.',
      means: 'The harami\'s hint of a reversal got confirmed: buyers took back the whole red candle.',
      trade: 'A confirmed signal. Stop below the pattern\'s low.',
      rule: 'Downtrend; long red candle; small green candle inside its body; then a green candle closing above the red open.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'down' && a.bear && long(a, x.ab) && m.bull && inside(m, a) && c.bull && c.c > a.o; },
    },
    {
      id: 'outsideup', name: 'Three Outside Up', short: '3 Outside Up', bias: 'bull', group: 'confirm', n: 3, ctx: 'down', strength: 3,
      draw: [[50, 51, 44, 45], [43, 56, 42, 55], [54, 64, 53, 63]],
      looks: 'A Bullish Engulfing (red candle swallowed by a bigger green one) followed by another green candle closing higher.',
      means: 'The engulfing reversal got a follow-through candle: buyers are staying in control.',
      trade: 'A confirmed signal. Stop below the pattern\'s low.',
      rule: 'Downtrend; red candle; green candle engulfing it; then a green candle closing above the engulfing close.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'down' && a.bear && m.bull && m.c >= a.o && m.o <= a.c && m.body > a.body && c.bull && c.c > m.c; },
    },
    {
      id: 'insidedown', name: 'Three Inside Down', short: '3 Inside Dn', bias: 'bear', group: 'confirm', n: 3, ctx: 'up', strength: 3,
      draw: [[42, 61, 41, 60], [56, 58, 49, 50], [51, 52, 38, 39]],
      looks: 'A Bearish Harami (big green + small candle inside it) followed by a red candle that closes BELOW the big green candle\'s open.',
      means: 'The harami\'s warning got confirmed: sellers took back the whole green candle.',
      trade: 'A confirmed signal. Stop above the pattern\'s high.',
      rule: 'Uptrend; long green candle; small red candle inside its body; then a red candle closing below the green open.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'up' && a.bull && long(a, x.ab) && m.bear && inside(m, a) && c.bear && c.c < a.o; },
    },
    {
      id: 'outsidedown', name: 'Three Outside Down', short: '3 Outside Dn', bias: 'bear', group: 'confirm', n: 3, ctx: 'up', strength: 3,
      draw: [[50, 56, 49, 55], [57, 58, 44, 45], [46, 47, 35, 36]],
      looks: 'A Bearish Engulfing (green candle swallowed by a bigger red one) followed by another red candle closing lower.',
      means: 'The engulfing top got a follow-through candle: sellers are staying in control.',
      trade: 'A confirmed signal. Stop above the pattern\'s high.',
      rule: 'Uptrend; green candle; red candle engulfing it; then a red candle closing below the engulfing close.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'up' && a.bull && m.bear && m.c <= a.o && m.o >= a.c && m.body > a.body && c.bear && c.c < m.c; },
    },
    // ----- more patterns -----
    {
      id: 'bullstrike', name: 'Bullish Three Line Strike', short: 'Bull Strike', bias: 'bull', group: 'triple', n: 4, ctx: 'down', strength: 3,
      draw: [[60, 61, 53, 54], [55, 56, 47, 48], [49, 50, 41, 42], [41, 63, 40, 62]],
      looks: 'Three red candles stepping down, then one big green candle that opens at/below the last close and closes above the FIRST red candle\'s open, wiping out all three.',
      means: 'Three candles of selling erased in one move: sellers got trapped and buyers took control.',
      trade: 'Stop below the big green candle\'s low. Strongest at a support level.',
      rule: 'Three falling red candles, then a green candle opening at/below the third close and closing at/above the first open.',
      test: (b, i) => { const [a, m, c, k] = [b[i - 3], b[i - 2], b[i - 1], b[i]]; return a.bear && m.bear && c.bear && m.c < a.c && c.c < m.c && k.bull && k.o <= c.c + 0.1 * c.body && k.c >= a.o; },
    },
    {
      id: 'bearstrike', name: 'Bearish Three Line Strike', short: 'Bear Strike', bias: 'bear', group: 'triple', n: 4, ctx: 'up', strength: 3,
      draw: [[40, 47, 39, 46], [45, 53, 44, 52], [51, 59, 50, 58], [59, 60, 37, 38]],
      looks: 'Three green candles stepping up, then one big red candle that opens at/above the last close and closes below the FIRST green candle\'s open.',
      means: 'Three candles of buying erased in one move: buyers got trapped and sellers took control.',
      trade: 'Stop above the big red candle\'s high. Strongest at a resistance level.',
      rule: 'Three rising green candles, then a red candle opening at/above the third close and closing at/below the first open.',
      test: (b, i) => { const [a, m, c, k] = [b[i - 3], b[i - 2], b[i - 1], b[i]]; return a.bull && m.bull && c.bull && m.c > a.c && c.c > m.c && k.bear && k.o >= c.c - 0.1 * c.body && k.c <= a.o; },
    },
    {
      id: 'rising3', name: 'Rising Three Methods', short: 'Rising 3', bias: 'bull', group: 'continuation', n: 5, ctx: 'up', strength: 2,
      draw: [[40, 57, 39, 56], [54, 55, 50, 51], [51, 53, 48, 49], [49, 51, 46, 47], [48, 63, 47, 62]],
      looks: 'A long green candle, three small candles drifting down but staying inside its range, then another long green candle closing at a new high.',
      means: 'A short rest inside an uptrend: sellers could not even break the first candle\'s low. The trend continues.',
      trade: 'Continuation signal: buyers often enter on the last candle with a stop below the small candles\' lows.',
      rule: 'Uptrend; long green candle; three small bodies (half its size or less) inside its high-low range; then a long green candle closing above the first close.',
      test: (b, i, x) => { const a = b[i - 4], e = b[i], mid = [b[i - 3], b[i - 2], b[i - 1]]; return x.tr === 'up' && a.bull && long(a, x.ab) && mid.every((k) => k.body <= 0.5 * a.body && k.h <= a.h + 0.1 * a.range && k.l >= a.l) && e.bull && long(e, x.ab) && e.c > a.c; },
    },
    {
      id: 'falling3', name: 'Falling Three Methods', short: 'Falling 3', bias: 'bear', group: 'continuation', n: 5, ctx: 'down', strength: 2,
      draw: [[60, 61, 43, 44], [46, 50, 45, 49], [49, 52, 47, 51], [51, 54, 49, 53], [52, 53, 37, 38]],
      looks: 'A long red candle, three small candles drifting up but staying inside its range, then another long red candle closing at a new low.',
      means: 'A short pause inside a downtrend: buyers could not break the first candle\'s high. The fall continues.',
      trade: 'Continuation signal: sellers often enter on the last candle with a stop above the small candles\' highs.',
      rule: 'Downtrend; long red candle; three small bodies inside its high-low range; then a long red candle closing below the first close.',
      test: (b, i, x) => { const a = b[i - 4], e = b[i], mid = [b[i - 3], b[i - 2], b[i - 1]]; return x.tr === 'down' && a.bear && long(a, x.ab) && mid.every((k) => k.body <= 0.5 * a.body && k.l >= a.l - 0.1 * a.range && k.h <= a.h) && e.bear && long(e, x.ab) && e.c < a.c; },
    },
    {
      id: 'sepbull', name: 'Bullish Separating Lines', short: 'Bull Sep', bias: 'bull', group: 'continuation', n: 2, ctx: 'up', strength: 1,
      draw: [[52, 53, 45, 46], [52.2, 64, 51.8, 63]],
      looks: 'In an uptrend: a red candle, then a long green candle that opens at the SAME price the red one opened and drives up.',
      means: 'The red candle\'s dip was rejected straight away; buyers resumed the trend from the same starting point.',
      trade: 'Continuation signal; stop below the green candle\'s low.',
      rule: 'Uptrend; red candle, then a long green candle opening within 10% of an average candle of the red open.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'up' && p.bear && k.bull && long(k, x.ab) && Math.abs(k.o - p.o) <= 0.1 * x.ar; },
    },
    {
      id: 'sepbear', name: 'Bearish Separating Lines', short: 'Bear Sep', bias: 'bear', group: 'continuation', n: 2, ctx: 'down', strength: 1,
      draw: [[48, 55, 47, 54], [47.8, 48.2, 36, 37]],
      looks: 'In a downtrend: a green candle, then a long red candle that opens at the SAME price the green one opened and drives down.',
      means: 'The bounce was rejected straight away; sellers resumed the trend from the same starting point.',
      trade: 'Continuation signal; stop above the red candle\'s high.',
      rule: 'Downtrend; green candle, then a long red candle opening within 10% of an average candle of the green open.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'down' && p.bull && k.bear && long(k, x.ab) && Math.abs(k.o - p.o) <= 0.1 * x.ar; },
    },
    {
      id: 'beltbull', name: 'Bullish Belt Hold', short: 'Bull Belt', bias: 'bull', group: 'single', n: 1, ctx: 'down', strength: 2,
      draw: [[42, 57, 41.8, 56]],
      looks: 'After a drop, a long green candle that opens at its LOW (no lower wick) and climbs most of the way up.',
      means: 'Buyers stepped in from the very first second and never let price go lower. A sharp turn of mood.',
      trade: 'Confirm with the next candle holding above the belt hold\'s middle. Stop below its open.',
      rule: 'Downtrend; green candle with a lower wick of 5% of the range or less, body 60%+ of the range and bigger than average.',
      test: (b, i, x) => x.tr === 'down' && b[i].bull && b[i].lo <= 0.05 * b[i].range && b[i].body >= 0.6 * b[i].range && b[i].body >= x.ab,
    },
    {
      id: 'beltbear', name: 'Bearish Belt Hold', short: 'Bear Belt', bias: 'bear', group: 'single', n: 1, ctx: 'up', strength: 2,
      draw: [[58, 58.2, 43, 44]],
      looks: 'After a rise, a long red candle that opens at its HIGH (no upper wick) and falls most of the way down.',
      means: 'Sellers took over from the very first second. A sharp turn against the uptrend.',
      trade: 'Confirm with the next candle staying below the belt hold\'s middle. Stop above its open.',
      rule: 'Uptrend; red candle with an upper wick of 5% of the range or less, body 60%+ of the range and bigger than average.',
      test: (b, i, x) => x.tr === 'up' && b[i].bear && b[i].up <= 0.05 * b[i].range && b[i].body >= 0.6 * b[i].range && b[i].body >= x.ab,
    },
    {
      id: 'counterbull', name: 'Bullish Counterattack', short: 'Bull Counter', bias: 'bull', group: 'double', n: 2, ctx: 'down', strength: 1,
      draw: [[58, 59, 45, 46], [34, 47, 33, 46.2]],
      looks: 'A long red candle, then a green candle that opens much LOWER but rallies to close right at the red candle\'s close.',
      means: 'Sellers pushed even lower, but buyers fought all the way back to the same level: selling is meeting resistance.',
      trade: 'Weak-to-medium signal. Needs a close above the pattern\'s high to confirm.',
      rule: 'Downtrend; long red candle; long green candle opening below the red close by half its body or more and closing within 10% of an average candle of the red close.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'down' && p.bear && long(p, x.ab) && k.bull && long(k, x.ab) && k.o < p.c - 0.5 * p.body && Math.abs(k.c - p.c) <= 0.1 * x.ar; },
    },
    {
      id: 'counterbear', name: 'Bearish Counterattack', short: 'Bear Counter', bias: 'bear', group: 'double', n: 2, ctx: 'up', strength: 1,
      draw: [[42, 55, 41, 54], [66, 67, 53, 53.8]],
      looks: 'A long green candle, then a red candle that opens much HIGHER but falls to close right at the green candle\'s close.',
      means: 'Buyers pushed higher, but sellers dragged price all the way back: the rally is meeting resistance.',
      trade: 'Weak-to-medium signal. Needs a close below the pattern\'s low to confirm.',
      rule: 'Uptrend; long green candle; long red candle opening above the green close by half its body or more and closing within 10% of an average candle of the green close.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return x.tr === 'up' && p.bull && long(p, x.ab) && k.bear && long(k, x.ab) && k.o > p.c + 0.5 * p.body && Math.abs(k.c - p.c) <= 0.1 * x.ar; },
    },
    {
      id: 'sandwichbull', name: 'Bullish Stick Sandwich', short: 'Bull Sandwich', bias: 'bull', group: 'triple', n: 3, ctx: 'down', strength: 1,
      draw: [[56, 57, 45, 46], [47, 58, 46, 57], [58, 59, 45, 46.2]],
      looks: 'Red, green, red: the green candle sits "sandwiched" between two red candles that close at the SAME price.',
      means: 'Price closed at the same level twice and buyers defended it: a support floor is forming.',
      trade: 'Stop below the shared closing level. Needs a move up to confirm.',
      rule: 'Downtrend; red candle; green candle closing above the red open; red candle closing within 10% of an average candle of the first close.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'down' && a.bear && m.bull && m.c > a.o && c.bear && Math.abs(c.c - a.c) <= 0.1 * x.ar; },
    },
    {
      id: 'sandwichbear', name: 'Bearish Stick Sandwich', short: 'Bear Sandwich', bias: 'bear', group: 'triple', n: 3, ctx: 'up', strength: 1,
      draw: [[44, 55, 43, 54], [53, 54, 42, 43], [42, 55, 41, 53.8]],
      looks: 'Green, red, green: the red candle sits between two green candles that close at the SAME price.',
      means: 'Price closed at the same level twice and could not get past it: a ceiling is forming.',
      trade: 'Stop above the shared closing level. Needs a move down to confirm.',
      rule: 'Uptrend; green candle; red candle closing below the green open; green candle closing within 10% of an average candle of the first close.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'up' && a.bull && m.bear && m.c < a.o && c.bull && Math.abs(c.c - a.c) <= 0.1 * x.ar; },
    },
    {
      id: 'advblock', name: 'Advance Block', short: 'Adv Block', bias: 'bear', group: 'triple', n: 3, ctx: 'up', strength: 2,
      draw: [[40, 51, 39, 50], [48, 57, 47, 55], [54, 63, 53, 57]],
      looks: 'Three green candles still making higher closes, but each body is SMALLER and the upper wicks get LONGER.',
      means: 'The rally is running out of breath: buyers are still winning, but by less each time, and sellers push back near the highs.',
      trade: 'A warning to tighten stops or take profit on longs, not a short signal by itself.',
      rule: 'Uptrend; three green candles with rising closes, shrinking bodies and a growing upper wick on the last one.',
      test: (b, i, x) => { const a = b[i - 2], m = b[i - 1], c = b[i]; return x.tr === 'up' && a.bull && m.bull && c.bull && m.c > a.c && c.c > m.c && a.body >= x.ab && m.body < a.body && c.body < 0.8 * m.body && c.up >= 0.6 * c.body && c.up > m.up; },
    },
    {
      id: 'insidebar', name: 'Inside Bar', short: 'Inside Bar', bias: 'neutral', group: 'neutral', n: 2, noisy: true, strength: 2,
      draw: [[44, 62, 40, 58], [54, 57, 47, 50]],
      looks: 'A candle whose whole range (high to low, wicks included) fits inside the previous candle\'s range.',
      means: 'The market is coiling up. Volatility is shrinking before the next move, a very popular setup in crypto.',
      trade: 'Traders mark the big candle\'s high and low: a close above the high is a long trigger, below the low a short trigger.',
      rule: 'High at or below the previous high, low at or above the previous low, and the previous candle is at least average size.',
      test: (b, i, x) => { const p = b[i - 1], k = b[i]; return k.h <= p.h && k.l >= p.l && p.range >= x.ar && k.range < p.range; },
    },
    {
      id: 'outsidebar', name: 'Outside Bar', short: 'Outside Bar', bias: 'neutral', group: 'neutral', n: 2, noisy: true, strength: 1,
      draw: [[48, 55, 45, 52], [50, 61, 40, 46]],
      looks: 'A candle whose range is bigger on BOTH ends than the previous candle: a higher high and a lower low.',
      means: 'A burst of volatility: both sides got stopped out. The close shows who won the fight.',
      trade: 'Lean with its close: closing near the high is bullish, near the low bearish. Wait for the next candle to agree.',
      rule: 'Higher high and lower low than the previous candle, and at least 1.2x its range.',
      test: (b, i) => { const p = b[i - 1], k = b[i]; return k.h > p.h && k.l < p.l && k.range >= 1.2 * p.range; },
    },
  ];
  const BY_ID = Object.fromEntries(DEFS.map((d) => [d.id, d]));
  // The strongest performers in Bulkowski's testing get a gold star. Engulfing patterns only earn it
  // at support/resistance: their low (bullish) or high (bearish) is at the lowest low / highest high of the last 20 candles.
  const TOP = ['bullstrike', 'bearstrike', 'crows', 'eveningstar', 'eveningdoji', 'morningstar', 'morningdoji', 'babybull', 'babybear'];
  for (const id of TOP) BY_ID[id].top = true;
  const LOOKBACK = 20;
  BY_ID.bullengulf.topAt = (b, i, s, x) => { let lo = Infinity; for (let j = Math.max(0, s - LOOKBACK); j < s; j++) lo = Math.min(lo, b[j].l); return Math.min(b[s].l, b[i].l) <= lo + 0.3 * x.ar; };
  BY_ID.bearengulf.topAt = (b, i, s, x) => { let hi = -Infinity; for (let j = Math.max(0, s - LOOKBACK); j < s; j++) hi = Math.max(hi, b[j].h); return Math.max(b[s].h, b[i].h) >= hi - 0.3 * x.ar; };
  const GOLD = '#f0b90b';
  // Bigger patterns win when several end on the same candle.
  const RANK = DEFS.map((d, i) => ({ d, i })).sort((a, b) => b.d.n - a.d.n || (b.d.group === 'confirm') - (a.d.group === 'confirm') || a.i - b.i).map((x) => x.d.id);
  const GROUPS = [
    ['neutral', 'Neutral (indecision)'],
    ['single', 'Single candle'],
    ['double', 'Two candles'],
    ['triple', 'Three or more candles'],
    ['continuation', 'Continuation (trend keeps going)'],
    ['confirm', 'Confirmation patterns'],
  ];

  // ---------- detection over real candles ----------
  const feat = (k) => {
    const o = +k.open, h = +k.high, l = +k.low, c = +k.close, top = Math.max(o, c), bot = Math.min(o, c);
    return { o, h, l, c, top, bot, body: top - bot, range: h - l, up: h - top, lo: bot - l, bull: c > o, bear: c < o };
  };
  // Returns an array (one slot per candle) of matches ending on that candle: [{ id, start }].
  function detect(list) {
    const n = list.length, bars = list.map(feat), out = new Array(n);
    const sumB = [0], sumR = [0], sumC = [0];
    for (let i = 0; i < n; i++) { sumB.push(sumB[i] + bars[i].body); sumR.push(sumR[i] + bars[i].range); sumC.push(sumC[i] + bars[i].c); }
    const avg = (s, a, b) => (b > a ? (s[b] - s[a]) / (b - a) : 0);
    // Trend going into a pattern that starts at s: last close vs 5 bars earlier and vs the 10-bar average.
    const trend = (s, ar) => {
      const j = s - 1;
      if (j < 10) return null;
      const c = bars[j].c, move = c - bars[j - 5].c, sma = avg(sumC, j - 9, j + 1);
      if (move < -0.8 * ar && c < sma) return 'down';
      if (move > 0.8 * ar && c > sma) return 'up';
      return null;
    };
    for (let i = 0; i < n; i++) {
      const m = [];
      const from = Math.max(0, i - 14);
      const x = { ab: avg(sumB, from, i) || bars[i].body, ar: avg(sumR, from, i) || bars[i].range };
      if (!(x.ar > 0)) { out[i] = m; continue; }
      const trs = {};
      for (const d of DEFS) {
        const s = i - d.n + 1;
        if (s < 0) continue;
        x.tr = trs[s] ?? (trs[s] = trend(s, x.ar));
        try { if (d.test(bars, i, x)) m.push({ id: d.id, start: s, top: !!(d.top || (d.topAt && d.topAt(bars, i, s, x))) }); } catch { /* not enough history */ }
      }
      m.sort((a, b) => RANK.indexOf(a.id) - RANK.indexOf(b.id));
      out[i] = m;
    }
    return out;
  }

  // ---------- drawings ----------
  // candles: [{ o, h, l, c, dim, hi }]. Returns an SVG string. opts: { w, h, pad, box: [from, to] (highlight), colors }
  function svgCandles(candles, opts = {}) {
    const w = opts.w || 120, h = opts.h || 90, pad = opts.pad ?? 8, up = opts.up || GREEN, dn = opts.down || RED;
    let lo = Infinity, hi = -Infinity;
    for (const k of candles) { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); }
    if (!(hi > lo)) { hi = lo + 1; }
    const n = candles.length, slot = (w - pad * 2) / n, bw = Math.max(2, Math.min(slot * 0.62, opts.maxBody || 22));
    const y = (v) => pad + ((hi - v) / (hi - lo)) * (h - pad * 2);
    const x = (i) => pad + slot * i + slot / 2;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${opts.width || w}" height="${opts.height || h}" xmlns="http://www.w3.org/2000/svg">`;
    if (opts.box) {
      const [a, b] = opts.box, bc = opts.boxColor || '#5b8cff';
      let bl = Infinity, bh = -Infinity;
      for (let i = a; i <= b; i++) { bl = Math.min(bl, candles[i].l); bh = Math.max(bh, candles[i].h); }
      s += `<rect x="${(x(a) - slot / 2 + 1).toFixed(1)}" y="${(y(bh) - 4).toFixed(1)}" width="${(slot * (b - a + 1) - 2).toFixed(1)}" height="${(y(bl) - y(bh) + 8).toFixed(1)}" rx="4" fill="${bc}22" stroke="${bc}" stroke-width="1" stroke-dasharray="${opts.boxDash || ''}"/>`;
    }
    if (opts.divider != null) s += `<line x1="${(x(opts.divider) - slot / 2).toFixed(1)}" x2="${(x(opts.divider) - slot / 2).toFixed(1)}" y1="2" y2="${h - 2}" stroke="#7d8696" stroke-width="1" stroke-dasharray="3 3"/>`;
    candles.forEach((k, i) => {
      const col = k.c >= k.o ? up : dn, op = k.dim ? 0.32 : 1;
      const cx = x(i).toFixed(1), top = y(Math.max(k.o, k.c)), bot = y(Math.min(k.o, k.c));
      s += `<g opacity="${op}"><line x1="${cx}" x2="${cx}" y1="${y(k.h).toFixed(1)}" y2="${y(k.l).toFixed(1)}" stroke="${col}" stroke-width="${opts.wick || 1.4}"/>`;
      s += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, bot - top).toFixed(1)}" fill="${col}" rx="1"/></g>`;
    });
    return s + '</svg>';
  }
  const arr = (a, dim) => a.map(([o, h, l, c]) => ({ o, h, l, c, dim }));
  // Handbook drawing of a pattern, with its trend context unless opts.noContext. opts.jitter adds randomness (quiz).
  function svgPattern(id, opts = {}) {
    const d = BY_ID[id];
    let ctx = opts.noContext ? [] : d.ctx === 'down' ? D : d.ctx === 'up' ? U : [];
    let pat = d.draw;
    if (opts.jitter) {
      const j = (v) => v + (Math.random() - 0.5) * opts.jitter;
      ctx = ctx.map((k) => k.map(j));
      // Keep each candle's shape valid: jitter body ends slightly, wicks stay outside the body.
      pat = pat.map(([o, h, l, c]) => { const s = 1 + (Math.random() - 0.5) * 0.15, m = (o + c) / 2, o2 = m + (o - m) * s, c2 = m + (c - m) * s; return [o2, Math.max(h, o2, c2), Math.min(l, o2, c2), c2]; });
    }
    return svgCandles([...arr(ctx, true), ...arr(pat, false)], opts);
  }

  // ---------- confirmation ----------
  // A pattern only suggests a move; the candles AFTER it confirm or reject it. Within CONFIRM_BARS closed candles:
  //  bullish: confirmed by a close above the pattern's last high, failed by a close below the pattern's low.
  //  bearish: confirmed by a close below the last low, failed by a close above the pattern's high.
  //  neutral: resolves up or down when a close breaks the pattern's high or low.
  // The newest candle is still forming, so it never counts.
  const CONFIRM_BARS = 3;
  const STATUS = {
    ok: { icon: '✓', label: 'Confirmed', tip: 'a later candle closed past the pattern in its direction' },
    built: { icon: '✓', label: 'Confirmed (built in)', tip: 'the pattern\'s own last candle is the confirmation' },
    fail: { icon: '✗', label: 'Failed', tip: 'price closed past the other side of the pattern first' },
    none: { icon: '–', label: 'No follow-through', tip: `nothing happened within ${CONFIRM_BARS} candles` },
    wait: { icon: '…', label: 'Waiting for confirmation', tip: `not enough closed candles after it yet (needs up to ${CONFIRM_BARS})` },
    up: { icon: '↑', label: 'Broke up', tip: 'a later candle closed above it' },
    down: { icon: '↓', label: 'Broke down', tip: 'a later candle closed below it' },
  };
  function confirmOf(list, m) {
    const d = BY_ID[m.id];
    if (d.group === 'confirm') return { s: 'built', at: m.end };
    let hi = -Infinity, lo = Infinity;
    for (let i = m.start; i <= m.end; i++) { hi = Math.max(hi, +list[i].high); lo = Math.min(lo, +list[i].low); }
    const last = list[m.end], lastClosed = list.length - 2;
    for (let j = m.end + 1; j <= Math.min(m.end + CONFIRM_BARS, lastClosed); j++) {
      const c = +list[j].close;
      if (d.bias === 'bull') { if (c > +last.high) return { s: 'ok', at: j, level: +last.high }; if (c < lo) return { s: 'fail', at: j, level: lo }; }
      else if (d.bias === 'bear') { if (c < +last.low) return { s: 'ok', at: j, level: +last.low }; if (c > hi) return { s: 'fail', at: j, level: hi }; }
      else { if (c > hi) return { s: 'up', at: j, level: hi }; if (c < lo) return { s: 'down', at: j, level: lo }; }
    }
    return { s: lastClosed - m.end >= CONFIRM_BARS ? 'none' : 'wait', level: d.bias === 'bear' ? +last.low : +last.high, lo, hi };
  }

  // ---------- chart highlighter (KLineChart indicator on the candle pane) ----------
  // state: what to show. Set by the handbook UI.
  const state = { off: new Set(), noisy: false, bias: { bull: true, bear: true, neutral: true }, focus: null, onlyConfirmed: false, onlyTop: false };
  let hits = []; // tag/box rectangles from the last draw, for clicks
  let onVisible = null; // callback(counts by id) after each draw
  const shown = (id) => { const d = BY_ID[id]; return d && !state.off.has(id) && (state.noisy || !d.noisy) && state.bias[d.bias]; };
  const isConfirmed = (s) => s === 'ok' || s === 'built' || s === 'up' || s === 'down';

  // Matches to draw: per candle the top-ranked visible one, skipping patterns hidden inside a bigger one.
  function pick(result, list, from, to, who) {
    const outp = [];
    let coverStart = -1, coverEnd = -1;
    for (let i = Math.min(to, result.length - 1); i >= Math.max(0, from); i--) {
      const ms = (result[i]?.m || []).filter((m) => shown(m.id));
      if (!ms.length) continue;
      const m = ms[0];
      if (i <= coverEnd && m.start >= coverStart && BY_ID[m.id].n === 1 && coverEnd - coverStart > 0) continue;
      const cf = confirmOf(list, { ...m, end: i });
      if (state.onlyConfirmed && !isConfirmed(cf.s)) continue;
      if (state.onlyTop && !m.top) continue;
      // Context grade (A/B/C) from analysis.js: daily EMA trend + market structure.
      const bias = BY_ID[m.id].bias;
      const g = bias !== 'neutral' && state.grade ? state.grade(list, i, bias === 'bull' ? 1 : -1, who) : null;
      if (state.hideC && g === 'C') continue;
      outp.push({ ...m, end: i, all: ms, cf, g });
      if (BY_ID[m.id].n > 1) { coverStart = m.start; coverEnd = i; }
    }
    return outp;
  }

  const rrect = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
  function register() {
    klinecharts.registerIndicator({
      name: 'CANDLE_PATTERNS', shortName: '', calcParams: [], figures: [],
      calc: (list) => detect(list).map((m) => ({ m })),
      createTooltipDataSource: () => ({ name: '', calcParamsText: '', values: [] }),
      draw: ({ ctx, kLineDataList, indicator, visibleRange, barSpace, xAxis, yAxis }) => {
        const res = indicator.result || [];
        // Extra layout charts pass { sub: true, coin, interval }; only the main chart feeds clicks and the panel counts.
        const who = indicator.extendData && typeof indicator.extendData === 'object' && indicator.extendData.sub ? indicator.extendData : null;
        const list = pick(res, kLineDataList, visibleRange.from, visibleRange.to, who);
        const counts = {};
        if (!who) hits = [];
        const rows = [[], [], []]; // tag collision rows above / below
        const rowsB = [[], [], []];
        const half = (barSpace?.bar ?? 6) / 2 + 2;
        ctx.font = '600 10px Segoe UI, -apple-system, system-ui, Roboto, sans-serif';
        ctx.textBaseline = 'middle';
        for (const m of list) {
          counts[m.id] = (counts[m.id] || 0) + 1;
          const d = BY_ID[m.id], col = BIAS_COLOR[d.bias], s = m.cf.s;
          const faded = (state.focus && state.focus !== m.id) || s === 'fail' || s === 'none' || m.g === 'C';
          let hiV = -Infinity, loV = Infinity;
          for (let i = m.start; i <= m.end; i++) { const k = kLineDataList[i]; if (k) { hiV = Math.max(hiV, k.high); loV = Math.min(loV, k.low); } }
          const x1 = xAxis.convertToPixel(m.start) - half, x2 = xAxis.convertToPixel(m.end) + half;
          const y1 = yAxis.convertToPixel(hiV) - 4, y2 = yAxis.convertToPixel(loV) + 4;
          const forming = m.end === kLineDataList.length - 1;
          ctx.globalAlpha = state.focus && state.focus !== m.id ? 0.15 : faded ? 0.45 : 1;
          ctx.fillStyle = col + (state.focus === m.id ? '33' : isConfirmed(s) ? '24' : '12');
          ctx.strokeStyle = col;
          ctx.lineWidth = state.focus === m.id || isConfirmed(s) ? 1.6 : 1;
          ctx.setLineDash(s === 'wait' ? [3, 3] : s === 'none' ? [1, 3] : []);
          rrect(ctx, x1, y1, x2 - x1, y2 - y1, 3);
          ctx.fill(); ctx.stroke();
          if (m.top) { ctx.strokeStyle = GOLD; ctx.lineWidth = 1.2; rrect(ctx, x1 - 3, y1 - 3, x2 - x1 + 6, y2 - y1 + 6, 5); ctx.stroke(); }
          ctx.setLineDash([]);
          // Tag: below for bullish, above for bearish/neutral, ending with the confirmation status.
          const text = `${m.g ? m.g + ' ' : ''}${m.top ? '\u2605 ' : ''}${forming ? '~ ' : ''}${d.short} ${STATUS[s].icon}`, tw = ctx.measureText(text).width + 8, cx = (x1 + x2) / 2;
          const below = d.bias === 'bull', rs = below ? rowsB : rows;
          let r = 0;
          while (r < 2 && rs[r].some(([a, b]) => cx - tw / 2 < b + 2 && cx + tw / 2 > a - 2)) r++;
          rs[r].push([cx - tw / 2, cx + tw / 2]);
          const ty = below ? y2 + 10 + r * 15 : y1 - 10 - r * 15;
          ctx.fillStyle = s === 'fail' ? '#5c6370' : col;
          rrect(ctx, cx - tw / 2, ty - 7, tw, 14, 3);
          ctx.fill();
          if (m.top) { ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke(); }
          ctx.fillStyle = s === 'fail' ? '#e6e9ef' : '#0b0e11';
          ctx.textAlign = 'center';
          ctx.fillText(text, cx, ty + 0.5);
          // Mark the candle that confirmed (or broke) the pattern.
          if (m.cf.at > m.end) {
            const k = kLineDataList[m.cf.at], cx2 = xAxis.convertToPixel(m.cf.at);
            const up = s === 'ok' ? d.bias === 'bull' : s === 'fail' ? d.bias === 'bear' : s === 'up';
            const yy = up ? yAxis.convertToPixel(k.low) + 9 : yAxis.convertToPixel(k.high) - 9;
            ctx.fillStyle = s === 'fail' ? '#7d8696' : s === 'up' ? BIAS_COLOR.bull : s === 'down' ? BIAS_COLOR.bear : col;
            ctx.beginPath(); ctx.arc(cx2, yy, 5.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#0b0e11';
            ctx.font = '700 8px Segoe UI, -apple-system, system-ui, Roboto, sans-serif';
            ctx.fillText(STATUS[s].icon, cx2, yy + 0.5);
            ctx.font = '600 10px Segoe UI, -apple-system, system-ui, Roboto, sans-serif';
          }
          ctx.globalAlpha = 1;
          if (!who) hits.push({ x1: Math.min(x1, cx - tw / 2), x2: Math.max(x2, cx + tw / 2), y1: Math.min(y1, ty - 7), y2: Math.max(y2, ty + 7), m, forming, time: kLineDataList[m.end]?.timestamp });
        }
        ctx.textAlign = 'left';
        if (onVisible && !who) onVisible(counts);
        return true;
      },
    });
  }
  const hitAt = (x, y) => hits.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) || null;

  return { DEFS, BY_ID, LOOKBACK, GROUPS, BIAS_COLOR, STATUS, CONFIRM_BARS, confirmOf, isConfirmed, detect, svgCandles, svgPattern, register, state, hitAt, setOnVisible: (f) => { onVisible = f; }, shown };
})();
