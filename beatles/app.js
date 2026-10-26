"use strict";

const PAPER = typeof require !== "undefined"
  ? require("./data.js")
  : { LENNON_SONGS, MCCARTNEY_SONGS, INTERCEPT, COEFFICIENTS, DISPUTED_SONGS, COLLABORATIVE_SONGS };

// ---------------------------------------------------------------------------
// Music basics: everything is measured in semitones above the tonic.
// ---------------------------------------------------------------------------

const DEGREES = ["1", "♭2", "2", "♭3", "3", "4", "♯4", "5", "♭6", "6", "♭7", "7"];
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const DIATONIC = [0, 2, 4, 5, 7, 9, 11];
const BLUE_NOTES = [3, 10];
const ON_SCALE = [...DIATONIC, ...BLUE_NOTES];

function mod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function noteName(midi) {
  return `${NOTE_NAMES[mod(midi, 12)]}${Math.floor(midi / 12) - 1}`;
}

function offsetOf(midi, tonic) {
  return mod(midi - tonic, 12);
}

function degreeOf(midi, tonic) {
  return DEGREES[offsetOf(midi, tonic)];
}

// Position on the major scale, counting octaves: 1 2 3 4 5 6 7 | 8 9 ...
function scaleIndex(midi, tonic) {
  const relative = midi - tonic;
  return Math.floor(relative / 12) * 7 + DIATONIC.indexOf(mod(relative, 12));
}

// ---------------------------------------------------------------------------
// Feature family 1: chords, collapsed into 9 categories.
// ---------------------------------------------------------------------------

const ROMAN_ORDER = ["I", "ii", "iii", "IV", "V", "vi", "vii"];
const DIATONIC_CHORDS = { 0: "I", 2: "ii", 4: "iii", 5: "IV", 7: "V", 9: "vi", 11: "vii" };
const CHORD_SUFFIX = { maj: "", min: "m", 7: "7", maj7: "maj7", m7: "m7", dim: "°", aug: "+" };
const TRIAD = { maj: "major", 7: "major", maj7: "major", min: "minor", m7: "minor", dim: "diminished", aug: "augmented" };
const UPPER_ROMANS = ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"];

const CHORD_CATEGORIES = [
  ...ROMAN_ORDER.map((roman) => ({ id: `chord:${roman}`, short: roman, label: `${roman} chord` })),
  { id: "chord:ND-maj", short: "off-key", sub: "major / aug", label: "off-key major or augmented chord" },
  { id: "chord:ND-min", short: "off-key", sub: "minor / dim", label: "off-key minor or diminished chord" },
];

function chordSymbol(chord) {
  return `${NOTE_NAMES[mod(chord.root, 12)]}${CHORD_SUFFIX[chord.quality]}`;
}

function romanName(chord, tonic) {
  const offset = mod(chord.root - tonic, 12);
  const triad = TRIAD[chord.quality];
  let roman = UPPER_ROMANS[offset];
  if (triad === "minor" || triad === "diminished") roman = roman.toLowerCase();
  if (triad === "diminished") roman += "°";
  if (triad === "augmented") roman += "+";
  return roman;
}

function chordCategory(chord, tonic) {
  const offset = mod(chord.root - tonic, 12);
  const triad = TRIAD[chord.quality];
  const reasons = [];
  if (["7", "maj7", "m7"].includes(chord.quality)) {
    reasons.push(`${chordSymbol(chord)} is a seventh chord, so it counts as its plain ${triad} triad.`);
  }
  const roman = DIATONIC_CHORDS[offset];
  const expected = ["I", "IV", "V"].includes(roman) ? "major" : "minor";
  if (roman && triad === expected) {
    reasons.push(`A ${triad} chord built on scale degree ${DEGREES[offset]} is the scale chord ${roman}.`);
    return { id: `chord:${roman}`, key: roman, reasons };
  }
  const majorish = triad === "major" || triad === "augmented";
  reasons.push(
    `A ${triad} chord on ${DEGREES[offset]} (${romanName(chord, tonic)}) is not one of the seven scale chords. ` +
    `It goes in the shared bin for off-key ${majorish ? "major and augmented" : "minor and diminished"} chords.`
  );
  return { id: majorish ? "chord:ND-maj" : "chord:ND-min", key: majorish ? "ND-maj" : "ND-min", reasons };
}

// ---------------------------------------------------------------------------
// Feature family 3: chord changes (pairs of consecutive chords).
// ---------------------------------------------------------------------------

function chordTransition(fromKey, toKey) {
  const fromOff = fromKey.startsWith("ND");
  const toOff = toKey.startsWith("ND");
  const primary = ["I", "IV", "V"];
  if (!fromOff && !toOff) {
    if (primary.includes(fromKey) && primary.includes(toKey)) {
      return {
        id: `ct:${fromKey}>${toKey}`,
        label: `${fromKey} → ${toKey}`,
        rule: "Both chords are among the big three (I, IV, V), so this change gets its own category and the order matters.",
      };
    }
    const [first, second] = [fromKey, toKey].sort((a, b) => ROMAN_ORDER.indexOf(a) - ROMAN_ORDER.indexOf(b));
    return {
      id: `ct:${first}-${second}`,
      label: `between ${first} and ${second}`,
      rule: "Two scale chords, not both from I, IV, V. The pair gets a category, but the order is ignored.",
    };
  }
  if (fromOff && toOff) {
    return { id: "ct:ND~ND", label: "off-key ↔ off-key", rule: "Both chords are off-key, so everything goes in one bin." };
  }
  const other = fromOff ? toKey : fromKey;
  if (other === "I") {
    return { id: "ct:I~ND", label: "between I and off-key", rule: "Any change between the tonic and an off-key chord, in either order, shares one bin." };
  }
  if (other === "V") {
    return { id: "ct:V~ND", label: "between V and off-key", rule: "Any change between the dominant and an off-key chord, in either order, shares one bin." };
  }
  return fromOff
    ? { id: "ct:ND>dia", label: "off-key → scale chord", rule: "From an off-key chord to a scale chord other than I or V." }
    : { id: "ct:dia>ND", label: "scale chord → off-key", rule: "From a scale chord other than I or V to an off-key chord." };
}

// ---------------------------------------------------------------------------
// Feature family 4: melodic moves (pairs of consecutive notes, with rests at
// the start and end of each phrase). A simplified version of the paper's rules.
// ---------------------------------------------------------------------------

function melodicMove(from, to, tonic) {
  const path = [];
  if (from === null || to === null) {
    const note = from === null ? to : from;
    const where = from === null ? "start" : "end";
    const offset = offsetOf(note, tonic);
    path.push({ question: "Is one side of the pair a phrase boundary (a rest)?", answer: `yes: the phrase ${where}s here` });
    if (DIATONIC.includes(offset)) {
      path.push({ question: "Is the note on the major scale?", answer: `yes, it is ${DEGREES[offset]}` });
      return { id: `mt:${where}:${DEGREES[offset]}`, label: `phrase ${where}s on ${DEGREES[offset]}`, path };
    }
    path.push({ question: "Is the note on the major scale?", answer: `no, it is ${DEGREES[offset]}` });
    return { id: `mt:${where}:off`, label: `phrase ${where}s off the scale`, path };
  }
  path.push({ question: "Is one side of the pair a phrase boundary (a rest)?", answer: "no" });
  const fromOffset = offsetOf(from, tonic);
  const toOffset = offsetOf(to, tonic);
  const fromDegree = DEGREES[fromOffset];
  const toDegree = DEGREES[toOffset];
  const direction = to > from ? "up" : "down";

  if (ON_SCALE.includes(fromOffset) && ON_SCALE.includes(toOffset)) {
    path.push({ question: "Are both notes on the scale (counting the blue notes ♭3 and ♭7)?", answer: `yes: ${fromDegree} and ${toDegree}` });
    if (fromOffset === toOffset) {
      path.push({ question: "Same pitch (ignoring octave)?", answer: "yes" });
      return { id: `mt:rep:${fromDegree}`, label: `repeated ${fromDegree}`, path };
    }
    path.push({ question: "Same pitch (ignoring octave)?", answer: "no" });
    const special = fromOffset === 0 || toOffset === 0 ||
      BLUE_NOTES.includes(fromOffset) || BLUE_NOTES.includes(toOffset) ||
      (fromOffset === 5 && toOffset === 7) || (fromOffset === 7 && toOffset === 5);
    if (special) {
      path.push({ question: "Does it touch 1, ♭3 or ♭7, or is it 4 ↔ 5?", answer: "yes, so this exact pair is its own category" });
      return { id: `mt:pair:${fromDegree}>${toDegree}`, label: `${fromDegree} → ${toDegree}`, path };
    }
    path.push({ question: "Does it touch 1, ♭3 or ♭7, or is it 4 ↔ 5?", answer: "no" });
    const size = Math.abs(scaleIndex(to, tonic) - scaleIndex(from, tonic));
    path.push({ question: "How many scale steps, and which way?", answer: `${size} ${direction}` });
    if (size === 1) return { id: `mt:step:${direction}`, label: `${direction} one scale step`, path };
    if (size <= 5) return { id: `mt:step:${direction}${size}`, label: `${direction} ${size} scale steps`, path };
    return { id: `mt:step:${direction}6+`, label: `${direction} 6+ scale steps`, path };
  }

  path.push({ question: "Are both notes on the scale (counting the blue notes ♭3 and ♭7)?", answer: `no: ${fromDegree} → ${toDegree} involves an off-scale note` });
  if (fromOffset === toOffset) {
    path.push({ question: "Same pitch?", answer: "yes" });
    return { id: "mt:nd:rep", label: "repeated off-scale note", path };
  }
  if (Math.abs(to - from) === 1) {
    path.push({ question: "Is it a half step?", answer: `yes, ${direction}` });
    return ON_SCALE.includes(toOffset)
      ? { id: `mt:nd:half-${direction}-to-dia`, label: `half step ${direction}, off-scale → scale`, path }
      : { id: `mt:nd:half-${direction}-from-dia`, label: `half step ${direction}, scale → off-scale`, path };
  }
  path.push({ question: "Is it a half step?", answer: `no, a bigger leap ${direction}` });
  return { id: `mt:nd:leap-${direction}`, label: `leap ${direction} from or to an off-scale note`, path };
}

// ---------------------------------------------------------------------------
// Feature family 5: four-note contours.
// ---------------------------------------------------------------------------

const DIRECTION_WORDS = { U: "up", D: "down", S: "same" };
const CONTOUR_SHAPES = [];
for (const a of "UDS") for (const b of "UDS") for (const c of "UDS") CONTOUR_SHAPES.push(a + b + c);

function stepDirection(from, to) {
  if (to > from) return "U";
  if (to < from) return "D";
  return "S";
}

function contourLabel(shape) {
  return [...shape].map((letter) => DIRECTION_WORDS[letter]).join(", ");
}

// ---------------------------------------------------------------------------
// Two made-up example songs (not Beatles transcriptions).
// Notes are [MIDI pitch, beats]; each phrase is followed by a rest.
// ---------------------------------------------------------------------------

const EXAMPLES = {
  a: {
    name: "Song A",
    tonic: 7,
    blurb: "in G major. Bluesy, with a borrowed B♭ chord and a ii–IV change.",
    chords: [
      { root: 7, quality: "maj", beats: 4 },
      { root: 4, quality: "min", beats: 4 },
      { root: 9, quality: "min", beats: 4 },
      { root: 0, quality: "maj", beats: 4 },
      { root: 2, quality: "7", beats: 4 },
      { root: 10, quality: "maj", beats: 2 },
      { root: 7, quality: "maj", beats: 2 },
    ],
    phrases: [
      [[71, 1], [71, 1], [69, 1], [67, 1], [64, 1], [67, 1], [69, 2]],
      [[72, 1], [71, 1], [69, 1], [72, 1], [73, 1], [74, 1], [76, 2]],
      [[74, 1], [72, 1], [69, 1], [72, 1], [70, 2], [67, 2]],
    ],
  },
  b: {
    name: "Song B",
    tonic: 0,
    blurb: "in C major. Mostly stepwise and on the scale, rocking between I and vi.",
    chords: [
      { root: 0, quality: "maj", beats: 2 },
      { root: 9, quality: "min", beats: 2 },
      { root: 0, quality: "maj", beats: 2 },
      { root: 9, quality: "min", beats: 2 },
      { root: 2, quality: "min", beats: 4 },
      { root: 7, quality: "maj", beats: 4 },
      { root: 4, quality: "min", beats: 4 },
      { root: 0, quality: "maj", beats: 4 },
    ],
    phrases: [
      [[64, 1], [64, 1], [67, 1], [64, 1], [62, 1], [64, 1], [67, 2]],
      [[69, 1], [67, 1], [64, 1], [67, 1], [66, 1], [67, 1], [69, 1], [67, 1]],
      [[64, 1], [64, 1], [62, 1], [64, 1], [60, 4]],
    ],
  },
};

function extractFeatures(example, transpose = 0) {
  const tonic = mod(example.tonic + transpose, 12);
  let beat = 0;
  const chords = example.chords.map((source) => {
    const chord = { root: mod(source.root + transpose, 12), quality: source.quality, beats: source.beats, start: beat };
    beat += source.beats;
    chord.symbol = chordSymbol(chord);
    chord.roman = romanName(chord, tonic);
    chord.category = chordCategory(chord, tonic);
    return chord;
  });

  const chordMoves = [];
  for (let index = 1; index < chords.length; index += 1) {
    const from = chords[index - 1];
    const to = chords[index];
    if (from.symbol === to.symbol) continue;
    chordMoves.push({ from, to, ...chordTransition(from.category.key, to.category.key) });
  }

  let time = 0;
  const phrases = example.phrases.map((phrase, phraseIndex) => phrase.map(([midi, beats]) => {
    const note = { midi: midi + transpose, beats, start: time, phrase: phraseIndex };
    time += beats;
    return note;
  }));
  const notes = phrases.flat();

  const moves = [];
  for (const phrase of phrases) {
    const sequence = [null, ...phrase, null];
    for (let index = 1; index < sequence.length; index += 1) {
      const from = sequence[index - 1];
      const to = sequence[index];
      moves.push({ from, to, ...melodicMove(from ? from.midi : null, to ? to.midi : null, tonic) });
    }
  }

  const contours = [];
  for (const phrase of phrases) {
    for (let index = 0; index + 4 <= phrase.length; index += 1) {
      const window = phrase.slice(index, index + 4);
      const shape = [0, 1, 2].map((k) => stepDirection(window[k].midi, window[k + 1].midi)).join("");
      contours.push({ notes: window, shape, id: `co:${shape}` });
    }
  }

  const counts = new Map();
  const add = (id) => counts.set(id, (counts.get(id) || 0) + 1);
  chords.forEach((chord) => add(chord.category.id));
  notes.forEach((note) => add(`note:${offsetOf(note.midi, tonic)}`));
  chordMoves.forEach((move) => add(move.id));
  moves.forEach((move) => add(move.id));
  contours.forEach((contour) => add(contour.id));

  return { example, tonic, chords, chordMoves, phrases, notes, moves, contours, counts, present: new Set(counts.keys()), totalBeats: Math.max(beat, time) };
}

// Every category our simplified scheme can produce, grouped by family.
function featureUniverse() {
  const unique = (items) => [...new Map(items.map((item) => [item.id, item])).values()];
  const chordKeys = [...ROMAN_ORDER, "ND-maj", "ND-min"];
  const chordPairs = [];
  for (const a of chordKeys) {
    for (const b of chordKeys) {
      if (a !== b || a.startsWith("ND")) chordPairs.push(chordTransition(a, b));
    }
  }
  const melodyPairs = [];
  const pitches = [null];
  for (let midi = 48; midi < 84; midi += 1) pitches.push(midi);
  for (const a of pitches) {
    for (const b of pitches) {
      if (a !== null || b !== null) melodyPairs.push(melodicMove(a, b, 0));
    }
  }
  return {
    chord: CHORD_CATEGORIES.map((category) => ({ id: category.id, label: category.label })),
    note: DEGREES.map((degree, offset) => ({ id: `note:${offset}`, label: `melody note ${degree}` })),
    ct: unique(chordPairs).map(({ id, label }) => ({ id, label: `chord change ${label}` })),
    mt: unique(melodyPairs).map(({ id, label }) => ({ id, label: `melodic move: ${label}` })),
    co: CONTOUR_SHAPES.map((shape) => ({ id: `co:${shape}`, label: `contour ${contourLabel(shape)}` })),
  };
}

const FAMILIES = [
  { key: "chord", name: "Chords", paper: 9, color: "var(--chord)" },
  { key: "note", name: "Melody notes", paper: 12, color: "var(--note)" },
  { key: "ct", name: "Chord changes", paper: 24, color: "var(--ct)" },
  { key: "mt", name: "Melodic moves", paper: 65, color: "var(--mt)" },
  { key: "co", name: "Contours", paper: 27, color: "var(--co)" },
];

// ---------------------------------------------------------------------------
// The paper's final logistic regression model (Table 4).
// ---------------------------------------------------------------------------

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function modelScore(present) {
  const terms = PAPER.COEFFICIENTS.filter((coefficient) => present.has(coefficient.id));
  const z = terms.reduce((sum, term) => sum + term.weight, PAPER.INTERCEPT);
  return { terms, z, p: sigmoid(z) };
}

// ---------------------------------------------------------------------------
// Evaluation of the 70 leave-one-out predictions (Tables 2 and 3).
// McCartney is the positive class, y = 1.
// ---------------------------------------------------------------------------

function scoredSongs() {
  return [
    ...PAPER.LENNON_SONGS.map(([name, p]) => ({ name, p, y: 0 })),
    ...PAPER.MCCARTNEY_SONGS.map(([name, p]) => ({ name, p, y: 1 })),
  ];
}

function confusion(songs, threshold) {
  const result = { tp: 0, fn: 0, tn: 0, fp: 0 };
  for (const song of songs) {
    const predicted = song.p >= threshold ? 1 : 0;
    if (song.y === 1) result[predicted ? "tp" : "fn"] += 1;
    else result[predicted ? "fp" : "tn"] += 1;
  }
  result.accuracy = (result.tp + result.tn) / songs.length;
  result.tpr = result.tp / (result.tp + result.fn);
  result.fpr = result.fp / (result.fp + result.tn);
  return result;
}

function rocCurve(songs) {
  const thresholds = [...new Set(songs.map((song) => song.p))].sort((a, b) => b - a);
  return [{ fpr: 0, tpr: 0, threshold: Infinity }, ...thresholds.map((threshold) => {
    const { fpr, tpr } = confusion(songs, threshold);
    return { fpr, tpr, threshold };
  })];
}

// AUC as the probability that a random McCartney song outscores a random Lennon song.
function auc(songs) {
  const positives = songs.filter((song) => song.y === 1);
  const negatives = songs.filter((song) => song.y === 0);
  let wins = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      if (positive.p > negative.p) wins += 1;
      else if (positive.p === negative.p) wins += 0.5;
    }
  }
  return wins / (positives.length * negatives.length);
}

// ---------------------------------------------------------------------------
// Screening: chi-squared test on a 2 x 2 table.
// ---------------------------------------------------------------------------

function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

function screeningTest(lennonWith, paulWith, lennonTotal = 39, paulTotal = 31) {
  const a = paulWith;
  const b = paulTotal - paulWith;
  const c = lennonWith;
  const d = lennonTotal - lennonWith;
  const n = a + b + c + d;
  const margins = (a + b) * (c + d) * (a + c) * (b + d);
  const chi2 = margins === 0 ? 0 : (n * (a * d - b * c) ** 2) / margins;
  const p = margins === 0 ? 1 : Math.min(1, erfc(Math.sqrt(chi2 / 2)));
  const zero = [a, b, c, d].some((cell) => cell === 0);
  const oddsRatio = zero ? ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)) : (a * d) / (b * c);
  return { a, b, c, d, chi2, p, oddsRatio };
}

// ---------------------------------------------------------------------------
// Elastic net geometry with two weights.
// penalty = (1 - alpha)/2 * (w1^2 + w2^2) + alpha * (|w1| + |w2|)
// ---------------------------------------------------------------------------

const LOSS_CENTER = [2.4, 0.9];
const LOSS_MATRIX = [[1, 0.55], [0.55, 0.8]];

function penalty(w1, w2, alpha) {
  return ((1 - alpha) / 2) * (w1 * w1 + w2 * w2) + alpha * (Math.abs(w1) + Math.abs(w2));
}

function loss(w1, w2) {
  const d1 = w1 - LOSS_CENTER[0];
  const d2 = w2 - LOSS_CENTER[1];
  const [[p, q], [, r]] = LOSS_MATRIX;
  return p * d1 * d1 + 2 * q * d1 * d2 + r * d2 * d2;
}

// Radius of the penalty boundary in direction theta, for a budget whose
// boundary crosses the axes at distance `reach`.
function boundaryRadius(theta, alpha, reach) {
  const budget = penalty(reach, 0, alpha);
  const l1 = Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta));
  if (alpha >= 0.999) return budget / l1;
  const a = (1 - alpha) / 2;
  const b = alpha * l1;
  return (-b + Math.sqrt(b * b + 4 * a * budget)) / (2 * a);
}

function constrainedSolution(alpha, reach) {
  if (penalty(LOSS_CENTER[0], LOSS_CENTER[1], alpha) <= penalty(reach, 0, alpha)) {
    return { w: [...LOSS_CENTER], loss: 0, inside: true };
  }
  let best = null;
  for (let step = 0; step < 3600; step += 1) {
    const theta = (step / 3600) * 2 * Math.PI;
    const radius = boundaryRadius(theta, alpha, reach);
    const w = [radius * Math.cos(theta), radius * Math.sin(theta)];
    const value = loss(w[0], w[1]);
    if (!best || value < best.loss) best = { w, loss: value, inside: false };
  }
  if (Math.abs(best.w[1]) < 0.01) best.w[1] = 0;
  if (Math.abs(best.w[0]) < 0.01) best.w[0] = 0;
  return best;
}

// ---------------------------------------------------------------------------
// An illustrative 70 x 137 binary matrix with the same shape as the paper's.
// ---------------------------------------------------------------------------

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function illustrativeMatrix() {
  const random = seededRandom(1962);
  const rows = 70;
  const columns = [];
  // 6 near-universal and 10 very rare features, as in the paper (16 removed).
  const common = new Set([0, 9, 11, 13, 16, 130]);
  const rare = new Set([8, 30, 41, 60, 71, 83, 95, 101, 112, 120]);
  for (let column = 0; column < 137; column += 1) {
    let count;
    if (common.has(column)) count = 66 + Math.floor(random() * 5);
    else if (rare.has(column)) count = 1 + Math.floor(random() * 5);
    else count = 7 + Math.floor(random() * 57);
    const order = [...Array(rows).keys()].sort(() => random() - 0.5);
    columns.push(new Set(order.slice(0, count)));
  }
  return { rows, columns, counts: columns.map((set) => set.size) };
}

// ---------------------------------------------------------------------------
// Rendering helpers.
// ---------------------------------------------------------------------------

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmt(value, digits = 3) {
  return Number(value).toFixed(digits);
}

const FAMILY_COLORS = { chord: "#6c4fa3", note: "#23806c", ct: "#b0761a", mt: "#b8406b", co: "#567a25" };

// A piano roll of melody notes under a lane of chord symbols.
function pianoRoll(analysis, options = {}) {
  const { highlightNotes = [], arrow = null, labels = "degree", highlightChords = [], showRests = true } = options;
  const beatWidth = 34;
  const left = 46;
  const midis = analysis.notes.map((note) => note.midi);
  const low = Math.min(...midis) - 1;
  const high = Math.max(...midis) + 1;
  const rowHeight = 15;
  const chordLane = 46;
  const top = chordLane + 10;
  const width = left + analysis.totalBeats * beatWidth + 40;
  const height = top + (high - low + 1) * rowHeight + 16;
  const y = (midi) => top + (high - midi) * rowHeight;
  const x = (beat) => left + beat * beatWidth;
  const parts = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Piano roll of ${escapeHTML(analysis.example.name)}">`];

  for (let midi = low; midi <= high; midi += 1) {
    const offset = offsetOf(midi, analysis.tonic);
    const fill = DIATONIC.includes(offset) ? "#fffdf7" : "#efe9dd";
    parts.push(`<rect x="${left}" y="${y(midi)}" width="${width - left - 40}" height="${rowHeight}" fill="${fill}" stroke="#e6dfd2" stroke-width="0.5"/>`);
    if (offset === 0 || DIATONIC.includes(offset)) {
      parts.push(`<text x="${left - 6}" y="${y(midi) + rowHeight - 4}" text-anchor="end" font-size="9.5" fill="${offset === 0 ? "#1d1c1a" : "#a39d92"}">${DEGREES[offset]}</text>`);
    }
  }
  for (let beat = 0; beat <= analysis.totalBeats; beat += 4) {
    parts.push(`<line x1="${x(beat)}" x2="${x(beat)}" y1="${chordLane - 4}" y2="${height - 16}" stroke="#cfc6b6" stroke-width="${beat % 8 === 0 ? 1.2 : 0.6}"/>`);
  }

  analysis.chords.forEach((chord, index) => {
    const lit = highlightChords.includes(index);
    parts.push(`<rect x="${x(chord.start) + 2}" y="4" width="${chord.beats * beatWidth - 4}" height="${chordLane - 12}" rx="6" fill="${lit ? "#6c4fa3" : "#ece6da"}"/>`);
    parts.push(`<text x="${x(chord.start) + 9}" y="21" font-size="13" font-weight="700" fill="${lit ? "white" : "#1d1c1a"}">${escapeHTML(chord.symbol)}</text>`);
    parts.push(`<text x="${x(chord.start) + 9}" y="35" font-size="11" fill="${lit ? "white" : "#6c4fa3"}">${escapeHTML(chord.roman)}</text>`);
  });

  analysis.phrases.forEach((phrase) => {
    const last = phrase[phrase.length - 1];
    const end = last.start + last.beats;
    if (showRests) {
      parts.push(`<text x="${x(phrase[0].start) + 1}" y="${height - 3}" font-size="9" fill="#a39d92">▸ start</text>`);
      parts.push(`<text x="${x(end) - 2}" y="${height - 3}" font-size="9" text-anchor="end" fill="#a39d92">end ◂</text>`);
    }
  });

  analysis.notes.forEach((note) => {
    const offset = offsetOf(note.midi, analysis.tonic);
    const lit = highlightNotes.includes(note);
    const blue = BLUE_NOTES.includes(offset);
    const off = !ON_SCALE.includes(offset);
    const fill = lit ? "#1d1c1a" : off ? "#b8406b" : blue ? "#2f86c8" : "#23806c";
    const label = labels === "name" ? NOTE_NAMES[mod(note.midi, 12)] : DEGREES[offset];
    parts.push(`<rect x="${x(note.start) + 1.5}" y="${y(note.midi) + 1}" width="${note.beats * beatWidth - 3}" height="${rowHeight - 2}" rx="4" fill="${fill}"/>`);
    parts.push(`<text x="${x(note.start) + 5}" y="${y(note.midi) + rowHeight - 4}" font-size="9.5" font-weight="700" fill="white">${label}</text>`);
  });

  if (arrow) {
    const [from, to] = arrow;
    const ax = from ? x(from.start + from.beats) - 4 : x(to.start) - 22;
    const ay = from ? y(from.midi) + rowHeight / 2 : y(to.midi) + rowHeight / 2;
    const bx = to ? x(to.start) + 4 : x(from.start + from.beats) + 22;
    const by = to ? y(to.midi) + rowHeight / 2 : y(from.midi) + rowHeight / 2;
    parts.push(`<defs><marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#d29a1e"/></marker></defs>`);
    parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#d29a1e" stroke-width="3" marker-end="url(#head)"/>`);
    if (!from) parts.push(`<text x="${ax - 2}" y="${ay - 6}" font-size="10" font-weight="700" fill="#d29a1e">rest</text>`);
    if (!to) parts.push(`<text x="${bx - 14}" y="${by - 6}" font-size="10" font-weight="700" fill="#d29a1e">rest</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

function contourGlyph(shape, size = 34, color = "currentColor") {
  const heights = [0];
  for (const letter of shape) heights.push(heights[heights.length - 1] + (letter === "U" ? 1 : letter === "D" ? -1 : 0));
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const span = Math.max(1, max - min);
  const points = heights.map((h, index) => `${4 + index * ((size - 8) / 3)},${size * 0.62 - 4 - ((h - min) / span) * (size * 0.62 - 10) + 2}`);
  return `<svg viewBox="0 0 ${size} ${size * 0.62}" width="${size}" aria-hidden="true"><polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${points.map((point) => `<circle cx="${point.split(",")[0]}" cy="${point.split(",")[1]}" r="2.4" fill="${color}"/>`).join("")}</svg>`;
}

function keyboard(tonic) {
  const whiteWidth = 34;
  const whites = [];
  const blacks = [];
  for (let midi = 60; midi < 84; midi += 1) {
    const pc = mod(midi, 12);
    if ([1, 3, 6, 8, 10].includes(pc)) blacks.push(midi);
    else whites.push(midi);
  }
  const whiteX = new Map(whites.map((midi, index) => [midi, index * whiteWidth]));
  const width = whites.length * whiteWidth;
  const parts = [`<svg viewBox="0 0 ${width + 2} 190" role="img" aria-label="Keyboard showing the major scale">`];
  const keyFill = (midi, isBlack) => {
    const offset = offsetOf(midi, tonic);
    if (offset === 0) return "#c4462b";
    if (DIATONIC.includes(offset)) return "#23806c";
    if (BLUE_NOTES.includes(offset)) return "#2f86c8";
    return isBlack ? "#2a2926" : "#fffefa";
  };
  const label = (midi) => {
    const offset = offsetOf(midi, tonic);
    return ON_SCALE.includes(offset) ? DEGREES[offset] : "";
  };
  for (const midi of whites) {
    const x0 = whiteX.get(midi) + 1;
    parts.push(`<rect x="${x0}" y="1" width="${whiteWidth - 1}" height="150" rx="4" fill="${keyFill(midi, false)}" stroke="#2a2926"/>`);
    parts.push(`<text x="${x0 + whiteWidth / 2 - 0.5}" y="138" text-anchor="middle" font-size="12" font-weight="700" fill="${keyFill(midi, false) === "#fffefa" ? "#1d1c1a" : "white"}">${label(midi)}</text>`);
    parts.push(`<text x="${x0 + whiteWidth / 2 - 0.5}" y="172" text-anchor="middle" font-size="11" fill="#6b665d">${NOTE_NAMES[mod(midi, 12)]}</text>`);
  }
  for (const midi of blacks) {
    const x0 = whiteX.get(midi - 1) + whiteWidth - 10;
    parts.push(`<rect x="${x0}" y="1" width="20" height="92" rx="3" fill="${keyFill(midi, true)}" stroke="#2a2926"/>`);
    parts.push(`<text x="${x0 + 10}" y="82" text-anchor="middle" font-size="10" font-weight="700" fill="white">${label(midi)}</text>`);
    parts.push(`<text x="${x0 + 10}" y="186" text-anchor="middle" font-size="9.5" fill="#a39d92">${NOTE_NAMES[mod(midi, 12)]}</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

function probabilityAxis(x, width, y, ticks = [0, 0.25, 0.5, 0.75, 1]) {
  return ticks.map((tick) => `<line x1="${x(tick)}" x2="${x(tick)}" y1="${y}" y2="${y + 5}" stroke="#6b665d"/><text x="${x(tick)}" y="${y + 18}" text-anchor="middle" font-size="11" fill="#6b665d">${tick}</text>`).join("") +
    `<line x1="${x(0)}" x2="${x(1)}" y1="${y}" y2="${y}" stroke="#6b665d"/>`;
}

function intervalChart(rows, note = "") {
  const width = 760;
  const left = 230;
  const right = 30;
  const rowHeight = 30;
  const height = rows.length * rowHeight + 50;
  const x = (p) => left + p * (width - left - right);
  const parts = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Probabilities with intervals${note}">`];
  parts.push(`<rect x="${x(0)}" y="0" width="${x(0.5) - x(0)}" height="${height - 40}" fill="#dde7f5" opacity="0.5"/>`);
  parts.push(`<rect x="${x(0.5)}" y="0" width="${x(1) - x(0.5)}" height="${height - 40}" fill="#f7e0d8" opacity="0.5"/>`);
  parts.push(`<text x="${x(0.25)}" y="14" text-anchor="middle" font-size="11" font-weight="700" fill="#2a5ea8">sounds like Lennon</text>`);
  parts.push(`<text x="${x(0.75)}" y="14" text-anchor="middle" font-size="11" font-weight="700" fill="#c4462b">sounds like McCartney</text>`);
  parts.push(`<line x1="${x(0.5)}" x2="${x(0.5)}" y1="0" y2="${height - 40}" stroke="#1d1c1a" stroke-dasharray="4 3"/>`);
  rows.forEach((row, index) => {
    const cy = 30 + index * rowHeight + rowHeight / 2;
    const color = row.p >= 0.5 ? "#c4462b" : "#2a5ea8";
    parts.push(`<text x="${left - 12}" y="${cy + 4}" text-anchor="end" font-size="13" fill="#1d1c1a">${escapeHTML(row.name)}</text>`);
    parts.push(`<line x1="${x(row.low)}" x2="${x(row.high)}" y1="${cy}" y2="${cy}" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`);
    parts.push(`<circle cx="${x(row.p)}" cy="${cy}" r="6.5" fill="${color}"><title>${escapeHTML(row.name)}: ${fmt(row.p)} (${fmt(row.low)} to ${fmt(row.high)})</title></circle>`);
    parts.push(`<text x="${x(row.high) + 8}" y="${cy + 4}" font-size="11" fill="#6b665d" class="mono">${fmt(row.p)}</text>`);
  });
  parts.push(probabilityAxis(x, width, height - 38));
  parts.push(`<text x="${x(0.5)}" y="${height - 2}" text-anchor="middle" font-size="11" fill="#6b665d">P(McCartney), dot = prediction, bar = leave-one-out 95% interval</text>`);
  parts.push("</svg>");
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Slides.
// ---------------------------------------------------------------------------

const state = {
  example: "a",
  transpose: 0,
  keyboardTonic: 0,
  chordChip: 5,
  chordStep: 0,
  moveStep: 0,
  contourStep: 0,
  countMode: "count",
  filterMatrix: false,
  screen: { lennon: 5, paul: 14 },
  checked: null,
  alpha: 0.3,
  reach: 1.2,
  threshold: 0.5,
  coefficientSort: "weight",
};

function currentAnalysis() {
  return extractFeatures(EXAMPLES[state.example], state.transpose);
}

function exampleSwitch() {
  return `<div class="controls">${Object.entries(EXAMPLES).map(([key, example]) =>
    `<button type="button" class="small ${state.example === key ? "on" : ""}" data-action="example" data-value="${key}">${example.name}</button>`
  ).join("")}</div>`;
}

function stepControls(action, index, total, noun) {
  return `<div class="controls">
    <button type="button" class="small" data-action="${action}" data-value="-1" ${index === 0 ? "disabled" : ""}>← previous ${noun}</button>
    <span class="mono">${index + 1} / ${total}</span>
    <button type="button" class="small primary" data-action="${action}" data-value="1" ${index === total - 1 ? "disabled" : ""}>next ${noun} →</button>
  </div>`;
}

const CHORD_CHIPS = [
  { root: 0, quality: "maj" }, { root: 2, quality: "min" }, { root: 4, quality: "min" }, { root: 5, quality: "maj" },
  { root: 7, quality: "maj" }, { root: 7, quality: "7" }, { root: 9, quality: "m7" }, { root: 5, quality: "maj7" },
  { root: 11, quality: "min" }, { root: 11, quality: "dim" }, { root: 10, quality: "maj" }, { root: 3, quality: "maj" },
  { root: 2, quality: "maj" }, { root: 5, quality: "min" }, { root: 0, quality: "aug" }, { root: 8, quality: "maj" },
];

const SLIDES = [
  {
    section: "Question",
    render: () => `
      <div class="title-slide">
        <p class="kicker">A walk-through of Glickman, Brown &amp; Song (2019)</p>
        <h1>Who wrote it? <span class="l">Lennon</span>, <span class="p">McCartney</span>, and a logistic regression</h1>
        <p class="lede" style="max-width: 760px">How do you turn songs into numbers a classifier can use? This deck follows one published answer step by step. Most of the time goes to the hardest part, which is <strong>designing the features</strong>.</p>
        <p class="title-meta">Paper: <a href="https://hdsr.mitpress.mit.edu/pub/xcq8a1v1/release/7">“(A) Data in the Life: Authorship Attribution in Lennon-McCartney Songs”</a>, <em>Harvard Data Science Review</em> 1.1, 2019.</p>
        <p class="keys-hint">Use <kbd>→</kbd> / <kbd>←</kbd> or the buttons below to move through the slides. Many slides have controls you can click.</p>
      </div>`,
  },
  {
    section: "Question",
    render: () => `
      <div class="slide two-col">
        <div>
          <p class="kicker">The puzzle</p>
          <h2>One songwriting credit, two songwriters</h2>
          <p>Before the Beatles took off, John Lennon and Paul McCartney agreed that every song either of them wrote would be credited to “Lennon–McCartney.”</p>
          <p>In practice, most songs were written mainly by <em>one</em> of them. Sometimes one wrote the verse and the other the middle section. After the band split, the two mostly agreed on who wrote what, but not always.</p>
          <p class="note-box"><strong>The question:</strong> can the music itself (notes and chords, no lyrics) tell us who wrote a song?</p>
        </div>
        <div class="stack">
          <div class="card">
            <h3>Songs are split into sections when authors differ</h3>
            <p class="small-print">“We Can Work It Out”: McCartney wrote the verse and chorus, Lennon the bridge (“Life is very short…”). The study treats these as two separate examples.</p>
            <div class="sections-bar">
              <span style="flex: 3; background: var(--paul)">verse / chorus · McCartney</span>
              <span style="flex: 1.3; background: var(--lennon)">bridge · Lennon</span>
            </div>
          </div>
          <div class="card">
            <h3>“In My Life”: the famous dispute</h3>
            <div class="sections-bar" style="margin-bottom: 0.7rem">
              <span style="flex: 3; background: #8f8a80">verse · ?</span>
              <span style="flex: 1.3; background: #8f8a80">bridge · ?</span>
            </div>
            <p class="small-print" style="margin: 0">Everyone agrees Lennon wrote the lyrics. McCartney said he wrote all the music. Lennon said McCartney only helped with the middle eight. Neither can be asked again, so the evidence has to come from somewhere else.</p>
          </div>
        </div>
      </div>`,
  },
  {
    section: "Question",
    render: () => {
      const analysis = extractFeatures(EXAMPLES.a);
      const degrees = analysis.phrases[0].map((note) => `<span class="token">${degreeOf(note.midi, analysis.tonic)}</span>`).join("");
      const chords = analysis.chords.map((chord) => `<span class="token">${chord.roman}</span>`).join("");
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">An old idea in a new medium</p>
          <h2>Stylometry: telling authors apart by habits</h2>
          <p>In 1963, Mosteller and Wallace looked at the 12 disputed <em>Federalist Papers</em>. They found that Hamilton and Madison used small function words at different rates. Hamilton wrote “upon” a lot; Madison preferred “whilst.” Their conclusion was that Madison wrote all 12.</p>
          <p>A text is one stream of tokens. A song has <strong>two streams running in parallel</strong>: the sung melody and the chords underneath it.</p>
          <p>Our job is the same as in text classification: chop the streams into countable pieces, much like words and n-grams.</p>
        </div>
        <div class="card stack">
          <div class="stream">
            <span class="label">text</span>
            <div class="tokens"><span class="token">it</span><span class="token">is</span><span class="token">not</span><span class="token marker">upon</span><span class="token">the</span><span class="token">whole</span><span class="token">…</span></div>
            <span class="label">melody (notes)</span>
            <div class="tokens">${degrees}<span class="token">…</span></div>
            <span class="label">harmony (chords)</span>
            <div class="tokens">${chords}</div>
          </div>
          <p class="small-print">The melody and chords come from a short made-up song we'll use throughout. Notes are written as positions in the scale (1 = home note) and chords as Roman numerals. The next slides explain why.</p>
          <table>
            <thead><tr><th>Text classification</th><th>This paper</th></tr></thead>
            <tbody>
              <tr><td>words (unigrams)</td><td>single notes, single chords</td></tr>
              <tr><td>word pairs (bigrams)</td><td>note → note, chord → chord</td></tr>
              <tr><td>longer patterns</td><td>4-note melody shapes (“contours”)</td></tr>
              <tr><td>one document</td><td>one song or song section</td></tr>
              <tr><td>author label</td><td><span class="lennon-text">Lennon</span> (y = 0) or <span class="paul-text">McCartney</span> (y = 1)</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;
    },
  },
  {
    section: "Question",
    render: () => {
      const cells = [
        ...Array(39).fill("var(--lennon)"),
        ...Array(31).fill("var(--paul)"),
        ...Array(8).fill("repeating-linear-gradient(45deg, #8f8a80 0 3px, #cfc8bb 3px 6px)"),
        ...Array(11).fill("#d29a1e"),
      ];
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">The data</p>
          <h2>A small corpus: 70 labeled examples</h2>
          <p>The study uses songs from 1962–66, the touring years, before studio experiments changed how the band wrote. That covers the UK albums <em>Please Please Me</em> through <em>Revolver</em>, plus the singles.</p>
          <p>Every song was coded <strong>by hand</strong> from published sheet music: each chord and each sung note.</p>
          <p class="note-box">Only 70 training examples is <em>tiny</em> for machine learning. Keep that number in mind. It explains almost every modeling decision later on.</p>
        </div>
        <div class="card stack">
          <div class="stat-row">
            <div class="stat"><strong class="lennon-text">39</strong><span>by Lennon</span></div>
            <div class="stat"><strong class="paul-text">31</strong><span>by McCartney</span></div>
            <div class="stat"><strong style="color:#8f8a80">8</strong><span>disputed</span></div>
            <div class="stat"><strong style="color:#d29a1e">11</strong><span>known collaborations</span></div>
          </div>
          <div class="waffle">${cells.map((fill) => `<span style="background:${fill}"></span>`).join("")}</div>
          <p class="small-print">Each square is one song or song section. The 70 colored ones train and evaluate the model. The model is then applied to the 8 disputed and 11 collaborative ones, whose labels are unknown or mixed.</p>
        </div>
      </div>`;
    },
  },
  {
    section: "Music",
    render: () => `
      <div class="slide two-col">
        <div>
          <p class="kicker">A two-minute music lesson</p>
          <h2>Twelve notes, seven “at home”</h2>
          <p>Western music uses 12 pitches that repeat every octave. A song in a given <strong>key</strong> mostly uses 7 of them, the <strong>major scale</strong>. We number those 1 to 7, with 1 (the <em>tonic</em>) as the home note.</p>
          <p>The other five are “off-scale” notes. Two of them, <span style="color:var(--blue-note);font-weight:700">♭3</span> and <span style="color:var(--blue-note);font-weight:700">♭7</span>, are so common in blues and rock that the paper treats them almost like scale notes. They are the <em>blue notes</em>.</p>
          <p class="muted">Try a few keys. The colored pattern slides along the keyboard, but the numbers keep the same spacing.</p>
        </div>
        <div class="card stack">
          <div class="controls"><label>Key</label>${NOTE_NAMES.map((name, pc) => `<button type="button" class="small ${state.keyboardTonic === pc ? "on" : ""}" data-action="keyboard" data-value="${pc}">${name}</button>`).join("")}</div>
          ${keyboard(state.keyboardTonic)}
          <div class="legend">
            <span><i class="swatch" style="background:#c4462b"></i>tonic (1)</span>
            <span><i class="swatch" style="background:#23806c"></i>other scale notes</span>
            <span><i class="swatch" style="background:#2f86c8"></i>blue notes ♭3, ♭7</span>
            <span><i class="swatch" style="background:#fffefa;border:1px solid #2a2926"></i>other off-scale notes</span>
          </div>
        </div>
      </div>`,
  },
  {
    section: "Music",
    render: () => {
      const analysis = extractFeatures(EXAMPLES.a, state.transpose);
      const phrase = analysis.phrases[0];
      const keyName = NOTE_NAMES[analysis.tonic];
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Feature design, step 0</p>
          <h2>Throw away the key</h2>
          <p>The same tune sung in G or in B♭ is still the same tune. If we recorded raw note names, the model would learn “Lennon likes the key of E” instead of anything about melody.</p>
          <p>So every song is <strong>transposed to a common reference</strong>. Each note is written as its position relative to the tonic. Songs in minor keys are treated as being in their relative major, which uses the same seven notes.</p>
          <p class="note-box">This is <em>normalization</em>, just like lowercasing text before counting words. It removes a difference we don't care about.</p>
        </div>
        <div class="card stack">
          <div class="controls"><label>Transpose</label>${[-5, -3, -2, 0, 2, 3, 5].map((shift) => `<button type="button" class="small ${state.transpose === shift ? "on" : ""}" data-action="transpose" data-value="${shift}">${shift > 0 ? "+" : ""}${shift}</button>`).join("")}<span class="chip">key of ${keyName} major</span></div>
          ${pianoRoll(analysis, { labels: "name", showRests: false })}
          <table>
            <tbody>
              <tr><th>note names</th>${phrase.map((note) => `<td class="mono">${noteName(note.midi)}</td>`).join("")}</tr>
              <tr><th>scale degrees</th>${phrase.map((note) => `<td class="mono"><strong>${degreeOf(note.midi, analysis.tonic)}</strong></td>`).join("")}</tr>
            </tbody>
          </table>
          <p class="small-print">First phrase of Song A. Press the transpose buttons: the top row changes, the bottom row never does.</p>
        </div>
      </div>`;
    },
  },
  {
    section: "Music",
    render: () => {
      const tonic = 0;
      const results = CHORD_CHIPS.map((chord) => ({ chord, symbol: chordSymbol(chord), category: chordCategory(chord, tonic) }));
      const selected = results[state.chordChip];
      const bins = CHORD_CATEGORIES.map((category) => {
        const members = results.filter((result) => result.category.id === category.id);
        return `<div class="card" style="padding:0.5rem 0.6rem; ${category.id === selected.category.id ? "outline: 3px solid var(--ink)" : ""}">
          <div style="font-family:var(--sans);font-weight:700;color:var(--chord)">${category.short} <span class="small-print">${category.sub || ""}</span></div>
          <div class="tokens" style="margin-top:0.3rem">${members.map((member) => `<span class="token">${member.symbol}</span>`).join("") || '<span class="small-print">–</span>'}</div>
        </div>`;
      }).join("");
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Feature family 1</p>
          <h2>Chords: collapse hundreds of names into 9 bins</h2>
          <p>Every major scale has seven “native” chords, named with Roman numerals: <strong>I ii iii IV V vi vii</strong>. Upper case means major, lower case minor. In C they are C, Dm, Em, F, G, Am and (the paper's choice) Bm.</p>
          <p>Everything else is rare in this corpus. With only 70 songs, a separate feature for each rare chord would almost never fire. So the paper:</p>
          <ul>
            <li>treats 7ths and other extended chords as their basic triad (G7 → G),</li>
            <li>puts <em>all</em> off-key major and augmented chords in one bin,</li>
            <li>puts <em>all</em> off-key minor and diminished chords in another.</li>
          </ul>
          <p class="note-box">This trade-off between detail and data comes up again and again. Fine categories are more informative, but each one is seen less often.</p>
        </div>
        <div class="card stack">
          <div class="controls"><label>Chords in C · click one</label></div>
          <div class="controls">${results.map((result, index) => `<button type="button" class="small ${state.chordChip === index ? "on" : ""}" data-action="chord-chip" data-value="${index}">${result.symbol}</button>`).join("")}</div>
          <div class="note-box lennon" style="border-color:var(--chord);background:#ece6f5"><strong>${selected.symbol}</strong> (${romanName(selected.chord, tonic)}): ${selected.category.reasons.join(" ")}</div>
          <div class="tile-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr))">${bins}</div>
        </div>
      </div>`;
    },
  },
  {
    section: "Features",
    render: () => {
      const analysis = currentAnalysis();
      return `
      <div class="slide">
        <p class="kicker">Our running example</p>
        <h2>Two short made-up songs</h2>
        <div class="two-col">
          <div>
            <p>To see feature extraction in action, we'll use two short invented songs instead of real Beatles transcriptions. Each has three melody phrases over a chord progression.</p>
            <p><strong>${analysis.example.name}</strong> is ${analysis.example.blurb}</p>
            ${exampleSwitch()}
            <p class="small-print" style="margin-top:1rem">How to read the piano roll: time runs left to right and pitch goes up. Chords are on top, with their Roman numerals. Each note is labeled with its scale degree. Light rows are scale notes. <span style="color:#2f86c8;font-weight:700">Blue</span> notes are ♭3/♭7 and <span style="color:#b8406b;font-weight:700">pink</span> notes are other off-scale notes. The “▸ start” and “end ◂” marks show where each phrase begins and ends; the rest after a phrase matters later.</p>
          </div>
          <div class="card">${pianoRoll(analysis)}</div>
        </div>
      </div>`;
    },
  },
  {
    section: "Features",
    render: () => {
      const analysis = currentAnalysis();
      const chordTiles = CHORD_CATEGORIES.map((category) => {
        const count = analysis.counts.get(category.id) || 0;
        return `<div class="tile fam-chord ${count ? "lit" : ""}">${category.short}<span class="sub">${category.sub || (count ? `${count}×` : "")}</span></div>`;
      }).join("");
      const noteTiles = DEGREES.map((degree, offset) => {
        const count = analysis.counts.get(`note:${offset}`) || 0;
        return `<div class="tile fam-note ${count ? "lit" : ""}">${degree}<span class="sub">${count ? `${count}×` : ""}</span></div>`;
      }).join("");
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Feature families 1 &amp; 2 · “unigrams”</p>
          <h2>Which chords appear? Which notes appear?</h2>
          <p>The simplest features ask whether each of the <strong>9 chord categories</strong> and each of the <strong>12 notes</strong> (octave ignored) appears anywhere in the song.</p>
          <p>That's 9 + 12 = 21 yes/no features. A lit tile is a 1 in the feature vector and a grey tile is a 0.</p>
          ${exampleSwitch()}
          <p class="small-print" style="margin-top:1rem">The counts (“3×”) are shown only for interest. The model only sees lit or not lit, and a few slides from now we'll see why.</p>
        </div>
        <div class="card stack">
          <h3 style="color:var(--chord)">Chords (9 features)</h3>
          <div class="tile-grid" style="grid-template-columns: repeat(9, minmax(0, 1fr))">${chordTiles}</div>
          <h3 style="color:var(--note)">Melody notes (12 features)</h3>
          <div class="tile-grid" style="grid-template-columns: repeat(12, minmax(0, 1fr))">${noteTiles}</div>
          ${pianoRoll(analysis)}
        </div>
      </div>`;
    },
  },
  {
    section: "Features",
    render: () => {
      const analysis = currentAnalysis();
      const index = Math.min(state.chordStep, analysis.chordMoves.length - 1);
      const move = analysis.chordMoves[index];
      const universe = featureUniverse().ct;
      const tiles = universe.map((item) => {
        const count = analysis.counts.get(item.id) || 0;
        return `<div class="tile fam-ct ${count ? "lit" : ""} ${item.id === move.id ? "current" : ""}" title="${escapeHTML(item.label)}">${escapeHTML(item.label.replace("chord change ", ""))}</div>`;
      }).join("");
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Feature family 3 · chord “bigrams”</p>
          <h2>Chord changes</h2>
          <p>Next, pairs of <em>consecutive</em> chords. With 9 chord bins there are 72 possible ordered pairs, far too many for 70 songs, so the paper collapses them with a few rules:</p>
          <ul>
            <li>Changes among the big three, <strong>I, IV, V</strong>, keep their order (V → I is different from I → V).</li>
            <li>Other pairs of scale chords ignore order (ii → V is the same as V → ii).</li>
            <li>Changes involving off-key chords go into a handful of shared bins.</li>
          </ul>
          <p class="small-print">The paper ends up with 24 chord-change categories that actually occur in the corpus. Our version of the rules can produce ${universe.length}.</p>
        </div>
        <div class="card stack">
          ${exampleSwitch()}
          ${pianoRoll(analysis, { highlightChords: [analysis.chords.indexOf(move.from), analysis.chords.indexOf(move.to)] })}
          ${stepControls("chord-step", index, analysis.chordMoves.length, "change")}
          <div class="note-box" style="border-color:var(--ct)"><strong>${move.from.symbol} → ${move.to.symbol}</strong> (${move.from.roman} → ${move.to.roman}) ⇒ <strong>${escapeHTML(move.label)}</strong><br><span class="small-print">${escapeHTML(move.rule)}</span></div>
          <div class="tile-grid" style="grid-template-columns: repeat(6, minmax(0, 1fr))">${tiles}</div>
        </div>
      </div>`;
    },
  },
  {
    section: "Features",
    render: () => {
      const analysis = currentAnalysis();
      const index = Math.min(state.moveStep, analysis.moves.length - 1);
      const move = analysis.moves[index];
      const highlight = [move.from, move.to].filter(Boolean);
      const seen = [...new Set(analysis.moves.map((item) => item.id))];
      const universeSize = featureUniverse().mt.length;
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Feature family 4 · melody “bigrams”</p>
          <h2>Melodic moves: from one note to the next</h2>
          <p>Every pair of consecutive notes becomes one feature. As in text, where we pad sentences with &lt;s&gt; and &lt;/s&gt;, each phrase is padded with a <strong>rest</strong> at both ends, so “phrase starts on 3” and “phrase ends on 5” are features too.</p>
          <p>There are hundreds of possible note pairs. To keep the categories populated, the paper sorts each pair with a small <strong>decision procedure</strong>, shown on the right. Moves that touch the tonic or the blue notes stay specific. Ordinary steps along the scale are lumped together.</p>
          <p class="small-print">We use a simplified version of the paper's rules, which can produce ${universeSize} categories. The paper kept the 65 that occur in its corpus.</p>
        </div>
        <div class="card stack">
          ${exampleSwitch()}
          ${pianoRoll(analysis, { highlightNotes: highlight, arrow: [move.from, move.to] })}
          ${stepControls("move-step", index, analysis.moves.length, "pair")}
          <ol class="path">
            ${move.path.map((step) => `<li>${escapeHTML(step.question)} <b>${escapeHTML(step.answer)}</b></li>`).join("")}
            <li class="result"><b>${escapeHTML(move.label)}</b></li>
          </ol>
          <div>
            <h3>Categories present in ${analysis.example.name} (${seen.length})</h3>
            <div class="category-list">${seen.map((id) => `<span class="chip fam-mt ${id === move.id ? "current" : ""}">${escapeHTML(analysis.moves.find((item) => item.id === id).label)}</span>`).join("")}</div>
          </div>
        </div>
      </div>`;
    },
  },
  {
    section: "Features",
    render: () => {
      const analysis = currentAnalysis();
      const index = Math.min(state.contourStep, analysis.contours.length - 1);
      const contour = analysis.contours[index];
      const tiles = CONTOUR_SHAPES.map((shape) => {
        const count = analysis.counts.get(`co:${shape}`) || 0;
        return `<div class="tile fam-co ${count ? "lit" : ""} ${shape === contour.shape ? "current" : ""}" title="${contourLabel(shape)}">${contourGlyph(shape, 34, count ? "white" : "#a39d92")}<span class="sub">${shape}</span></div>`;
      }).join("");
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Feature family 5 · melody shape</p>
          <h2>Contours: the shape of four notes</h2>
          <p>Note pairs only see two notes at a time. Exact 4-note sequences would be far too sparse. As a compromise, the paper slides a 4-note window along each phrase and records only the <strong>shape</strong>: is each step up (U), down (D), or the same (S)?</p>
          <p>Three steps with three choices each gives 3 × 3 × 3 = <strong>27 contour features</strong>. The window never crosses a phrase boundary.</p>
          <p class="note-box">The pattern is to keep <em>some</em> information about longer sequences while throwing away most of the detail. Bag-of-n-grams models in NLP make the same kind of choice.</p>
        </div>
        <div class="card stack">
          ${exampleSwitch()}
          ${pianoRoll(analysis, { highlightNotes: contour.notes })}
          ${stepControls("contour-step", index, analysis.contours.length, "window")}
          <div class="note-box" style="border-color:var(--co);background:#e8f0dc;display:flex;gap:1rem;align-items:center">${contourGlyph(contour.shape, 60, "#567a25")}<div><strong>${contour.notes.map((note) => degreeOf(note.midi, analysis.tonic)).join(" → ")}</strong><br>${contourLabel(contour.shape)} ⇒ feature <span class="mono">${contour.shape}</span></div></div>
          <div class="tile-grid" style="grid-template-columns: repeat(9, minmax(0, 1fr))">${tiles}</div>
        </div>
      </div>`;
    },
  },
  {
    section: "Features",
    render: () => {
      const features = [
        { name: "Chord ♭VII (off-key major)", sections: { verse: 0, bridge: 1, coda: 19 } },
        { name: "Chord change V → I", sections: { verse: 6, bridge: 2, coda: 0 } },
        { name: "Melody: phrase ends on 1", sections: { verse: 5, bridge: 1, coda: 19 } },
        { name: "Melody: 4 → 5", sections: { verse: 3, bridge: 1, coda: 0 } },
        { name: "Contour DDU", sections: { verse: 4, bridge: 2, coda: 0 } },
        { name: "Chord ii", sections: { verse: 0, bridge: 2, coda: 0 } },
      ];
      const transform = {
        count: (n) => n,
        capped: (n) => Math.min(n, 5),
        log: (n) => Math.log(1 + n),
        presence: (n) => (n > 0 ? 1 : 0),
      }[state.countMode];
      const values = features.map((feature) => {
        const total = feature.sections.verse + feature.sections.bridge + feature.sections.coda;
        return { ...feature, total, value: transform(total) };
      });
      const max = Math.max(...values.map((value) => value.value));
      const modes = [["count", "raw counts"], ["capped", "capped at 5"], ["log", "log(1 + count)"], ["presence", "present / absent"]];
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">A design decision</p>
          <h2>Count it, or just note that it's there?</h2>
          <p>Text models usually <em>count</em> words. Songs, though, repeat themselves on purpose: verses, choruses, refrains. The “na na na” coda of “Hey Jude” repeats its four-bar phrase about 19 times.</p>
          <p>With counts, whatever is in the most-repeated section swamps everything else. The authors tried raw counts, capped counts and log counts. <strong>Plain presence/absence (0/1) predicted best.</strong></p>
          <p class="small-print">The counts on the right are made up for a song shaped like “Hey Jude”: a verse section, a bridge, and a long repeated coda.</p>
        </div>
        <div class="card stack">
          <div class="controls">${modes.map(([mode, label]) => `<button type="button" class="small ${state.countMode === mode ? "on" : ""}" data-action="count-mode" data-value="${mode}">${label}</button>`).join("")}</div>
          <svg viewBox="0 0 640 ${values.length * 44 + 10}" role="img" aria-label="Feature values under different transformations">
            ${values.map((value, row) => `
              <text x="210" y="${row * 44 + 27}" text-anchor="end" font-size="13">${escapeHTML(value.name)}</text>
              <rect x="222" y="${row * 44 + 10}" width="${max ? (value.value / max) * 360 : 0}" height="24" rx="4" fill="${value.sections.coda ? "#d29a1e" : "#1d1c1a"}"/>
              <text x="${230 + (max ? (value.value / max) * 360 : 0)}" y="${row * 44 + 27}" font-size="12" class="mono">${state.countMode === "log" ? fmt(value.value, 2) : value.value}</text>`).join("")}
          </svg>
          <div class="legend"><span><i class="swatch" style="background:#d29a1e"></i>appears in the repeated coda</span><span><i class="swatch" style="background:#1d1c1a"></i>verse / bridge only</span></div>
        </div>
      </div>`;
    },
  },
  {
    section: "Features",
    render: () => {
      const analysis = currentAnalysis();
      const universe = featureUniverse();
      const blocks = FAMILIES.map((family) => {
        const items = universe[family.key];
        const lit = items.filter((item) => analysis.present.has(item.id)).length;
        return `<div style="margin-bottom:0.8rem">
          <div style="display:flex;justify-content:space-between;font-family:var(--sans);font-size:0.85rem"><strong style="color:${family.color}">${family.name}</strong><span class="muted">${lit} of ${items.length} on · paper: ${family.paper}</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:0.25rem">${items.map((item) => `<span title="${escapeHTML(item.label)}" style="width:12px;height:22px;border-radius:2px;background:${analysis.present.has(item.id) ? family.color : "#e4ddd0"}"></span>`).join("")}</div>
        </div>`;
      }).join("");
      const total = FAMILIES.reduce((sum, family) => sum + universe[family.key].length, 0);
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Putting it together</p>
          <h2>One song = one long row of 0s and 1s</h2>
          <p>Each song becomes a binary vector. In the paper the five families add up to</p>
          <p class="mono" style="font-size:1.15rem">9 + 12 + 24 + 65 + 27 = <strong>137</strong> features.</p>
          <p>The right-hand side shows our simplified version (${total} possible features). Each cell is one feature, and a colored cell is a 1 for ${analysis.example.name}. Hover over a cell to see its name.</p>
          ${exampleSwitch()}
          <p class="note-box" style="margin-top:1rem">This is exactly the input format of the classifiers from earlier chapters, a feature vector <strong>x</strong>. Everything up to this point was <em>feature engineering</em>, and all of it used musical knowledge rather than machine learning.</p>
        </div>
        <div class="card">${blocks}</div>
      </div>`;
    },
  },
  {
    section: "Features",
    render: () => {
      const matrix = illustrativeMatrix();
      const cell = 5;
      const gap = 1;
      const left = 4;
      const top = 30;
      const familyBreaks = [0, 9, 21, 45, 110, 137];
      const removed = matrix.counts.map((count) => count <= 5 || count >= 66);
      const kept = removed.filter((flag) => !flag).length;
      const parts = [`<svg viewBox="0 0 ${left + 137 * (cell + gap) + 4} ${top + 70 * (cell + gap) + 64}" role="img" aria-label="Illustrative 70 by 137 binary matrix">`];
      FAMILIES.forEach((family, index) => {
        const x0 = left + familyBreaks[index] * (cell + gap);
        const x1 = left + familyBreaks[index + 1] * (cell + gap) - gap;
        parts.push(`<rect x="${x0}" y="6" width="${x1 - x0}" height="8" rx="2" fill="${family.color}"/>`);
        parts.push(`<text x="${(x0 + x1) / 2}" y="26" text-anchor="middle" font-size="9" fill="#6b665d">${family.paper}</text>`);
      });
      for (let column = 0; column < 137; column += 1) {
        const x0 = left + column * (cell + gap);
        const faded = state.filterMatrix && removed[column];
        for (let row = 0; row < 70; row += 1) {
          if (!matrix.columns[column].has(row)) continue;
          const fill = faded ? "#ddd5c6" : row < 39 ? "#2a5ea8" : "#c4462b";
          parts.push(`<rect x="${x0}" y="${top + row * (cell + gap)}" width="${cell}" height="${cell}" fill="${fill}"/>`);
        }
        if (removed[column]) {
          parts.push(`<text x="${x0 + cell / 2}" y="${top + 70 * (cell + gap) + 12}" text-anchor="middle" font-size="9" fill="${state.filterMatrix ? "#c4462b" : "#a39d92"}">${state.filterMatrix ? "✕" : "·"}</text>`);
        }
      }
      parts.push(`<text x="${left}" y="${top + 70 * (cell + gap) + 32}" font-size="11" fill="#6b665d">rows: 39 Lennon (blue) then 31 McCartney (red) · columns: features · filled = 1</text>`);
      parts.push("</svg>");
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">The data matrix</p>
          <h2>70 songs × 137 features</h2>
          <p>Stack the 70 song vectors and you get the matrix <strong>X</strong>, with labels <strong>y</strong> beside it.</p>
          <p>Some columns are useless. A feature that appears in nearly <em>every</em> song can't separate anyone (the tonic chord, the notes 1, 2, 3, 5). A feature that appears in five songs or fewer is too rare to estimate reliably.</p>
          <p>The paper drops features present in ≤ 5 or ≥ 66 of the 70 songs, which removes 16 of them and leaves <strong>121</strong>.</p>
          <div class="controls"><button type="button" class="${state.filterMatrix ? "on" : "primary"}" data-action="filter-matrix">${state.filterMatrix ? "Show all features" : "Drop too-rare and too-common features"}</button></div>
          <p class="small-print" style="margin-top:1rem">This picture is <strong>simulated</strong> to have the same shape and the same number of extreme columns as the real data. The paper doesn't publish its matrix.</p>
        </div>
        <div class="card">${parts.join("")}<p class="small-print" style="margin:0.4rem 0 0">Columns kept: <strong>${state.filterMatrix ? kept : 137}</strong></p></div>
      </div>`;
    },
  },
  {
    section: "Model",
    render: () => {
      const steps = [
        [137, "features extracted from each song"],
        [121, "after dropping features that are too rare (≤ 5 songs) or too common (≥ 66 songs)"],
        [40, "after screening: keep features with some evidence of an association with the author (p < 0.25)"],
        [29, "with a non-zero weight after elastic-net logistic regression"],
      ];
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">The modeling problem</p>
          <h2>More features than examples</h2>
          <p>We have 121 features and only 70 songs. A linear classifier with that many weights can usually separate the training data <em>perfectly</em> just by memorizing quirks. That's overfitting, and its predictions on new songs would be junk.</p>
          <p>The paper's recipe has two steps that keep the model small:</p>
          <ol>
            <li><strong>Screening.</strong> Test each feature on its own and drop the ones with no sign of a link to the author.</li>
            <li><strong>Regularized logistic regression.</strong> Fit the classifier with a penalty that pulls weights toward zero and can set many of them exactly to zero.</li>
          </ol>
          <p class="small-print">Genetics has the same problem, with thousands of genes and only dozens of patients. The paper borrows its methods from there.</p>
        </div>
        <div class="card funnel">
          ${steps.map(([count, text]) => `<div><strong>${count}</strong><div><div class="bar" style="width:${(count / 137) * 100}%"></div><div class="bar-label">${text}</div></div></div>`).join("")}
        </div>
      </div>`;
    },
  },
  {
    section: "Model",
    render: () => {
      const test = screeningTest(state.screen.lennon, state.screen.paul);
      const presets = [
        ["McCartney-leaning", 5, 14],
        ["borderline", 12, 14],
        ["Lennon-leaning", 18, 6],
        ["no association", 20, 16],
        ["rare", 1, 3],
      ];
      const stepper = (who) => `<span class="stepper"><button type="button" data-action="screen" data-value="${who}:-1">−</button><button type="button" data-action="screen" data-value="${who}:1">+</button></span>`;
      const verdict = (threshold) => `<span class="verdict ${test.p < threshold ? "keep" : "drop"}">${test.p < threshold ? "keep" : "drop"}</span>`;
      const lennonShare = state.screen.lennon / 39;
      const paulShare = state.screen.paul / 31;
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Step 1 · screening</p>
          <h2>Does this one feature care who wrote the song?</h2>
          <p>For each feature on its own, build a 2 × 2 table: author by feature present or absent. If the feature appears at about the same rate in Lennon and McCartney songs, it's no use for telling them apart.</p>
          <p>A <strong>chi-squared test</strong> turns the table into a p-value. A small p means “an imbalance this large would be surprising if the feature were unrelated to the author.” Features with p below a threshold are kept.</p>
          <p>The threshold is a <strong>hyperparameter</strong>. The paper tried 1.0 (keep everything), 0.75, 0.5, 0.25 and 0.10, and 0.25 won.</p>
          <p class="small-print">The counts on the right are hypothetical. Because some cells are small, the paper computes p-values by simulation; we use the standard approximation.</p>
        </div>
        <div class="card stack">
          <div class="controls"><label>Try</label>${presets.map(([name, lennon, paul]) => `<button type="button" class="small" data-action="screen-preset" data-value="${lennon}:${paul}">${name}</button>`).join("")}</div>
          <table class="contingency">
            <thead><tr><th></th><th>feature present</th><th>feature absent</th><th>total</th></tr></thead>
            <tbody>
              <tr><th class="lennon-text">Lennon</th><td class="big">${test.c} ${stepper("lennon")}</td><td class="big">${test.d}</td><td>39</td></tr>
              <tr><th class="paul-text">McCartney</th><td class="big">${test.a} ${stepper("paul")}</td><td class="big">${test.b}</td><td>31</td></tr>
            </tbody>
          </table>
          <svg viewBox="0 0 520 70" role="img" aria-label="Share of songs with the feature">
            <text x="0" y="22" font-size="12" fill="#2a5ea8">Lennon</text><rect x="80" y="10" width="420" height="16" rx="3" fill="#ece6da"/><rect x="80" y="10" width="${lennonShare * 420}" height="16" rx="3" fill="#2a5ea8"/><text x="${86 + lennonShare * 420}" y="23" font-size="11">${Math.round(lennonShare * 100)}%</text>
            <text x="0" y="56" font-size="12" fill="#c4462b">McCartney</text><rect x="80" y="44" width="420" height="16" rx="3" fill="#ece6da"/><rect x="80" y="44" width="${paulShare * 420}" height="16" rx="3" fill="#c4462b"/><text x="${86 + paulShare * 420}" y="57" font-size="11">${Math.round(paulShare * 100)}%</text>
          </svg>
          <div class="stat-row">
            <div class="stat"><strong class="mono">${fmt(test.oddsRatio, 2)}</strong><span>odds ratio (&gt; 1 leans McCartney)</span></div>
            <div class="stat"><strong class="mono">${fmt(test.chi2, 2)}</strong><span>χ² statistic</span></div>
            <div class="stat"><strong class="mono">${test.p < 0.001 ? "&lt; 0.001" : fmt(test.p, 3)}</strong><span>p-value</span></div>
          </div>
          <table>
            <thead><tr><th>threshold</th>${[1, 0.75, 0.5, 0.25, 0.1].map((t) => `<th>${t}</th>`).join("")}</tr></thead>
            <tbody><tr><td>verdict</td>${[1, 0.75, 0.5, 0.25, 0.1].map((t) => `<td>${t === 1 ? '<span class="verdict keep">keep</span>' : verdict(t)}</td>`).join("")}</tr></tbody>
          </table>
        </div>
      </div>`;
    },
  },
  {
    section: "Model",
    render: () => {
      if (!state.checked) state.checked = new Set(PAPER.COEFFICIENTS.filter((c) => extractFeatures(EXAMPLES.a).present.has(c.id)).map((c) => c.id));
      const score = modelScore(state.checked);
      const groups = FAMILIES.map((family) => {
        const items = PAPER.COEFFICIENTS.filter((coefficient) => coefficient.family === family.key);
        return items.map((item) => `<label><input type="checkbox" data-action="toggle-feature" data-value="${escapeHTML(item.id)}" ${state.checked.has(item.id) ? "checked" : ""}><span><span class="swatch" style="background:${family.color}"></span>${escapeHTML(item.label)}</span><span class="w ${item.weight > 0 ? "pos" : "neg"}">${item.weight > 0 ? "+" : ""}${fmt(item.weight)}</span></label>`).join("");
      }).join("");
      const curveWidth = 300;
      const curveHeight = 120;
      const zx = (z) => 20 + ((z + 6) / 12) * (curveWidth - 40);
      const py = (p) => 10 + (1 - p) * (curveHeight - 30);
      const curve = [];
      for (let z = -6; z <= 6.001; z += 0.25) curve.push(`${zx(z)},${py(sigmoid(z))}`);
      const clamped = Math.max(-6, Math.min(6, score.z));
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Step 2 · the classifier</p>
          <h2>Logistic regression on yes/no features</h2>
          <p>This is the model from the logistic regression chapter. Each feature j has a weight w<sub>j</sub>. Add up the weights of the features that are <em>present</em>, plus a bias:</p>
          <p class="mono" style="font-size:1.05rem">z = b + Σ w<sub>j</sub> x<sub>j</sub> &nbsp;&nbsp; p̂ = σ(z) = 1 / (1 + e<sup>−z</sup>)</p>
          <p>Here p̂ is the predicted probability that <span class="paul-text">McCartney</span> wrote the song. Positive weights push toward McCartney and negative weights toward <span class="lennon-text">Lennon</span>.</p>
          <p>These are the <strong>real 29 weights</strong> of the paper's final model (bias b = ${PAPER.INTERCEPT}). Tick boxes to build a song.</p>
          <div class="controls">
            <button type="button" class="small" data-action="checked-preset" data-value="a">features of Song A</button>
            <button type="button" class="small" data-action="checked-preset" data-value="b">features of Song B</button>
            <button type="button" class="small" data-action="checked-preset" data-value="none">clear</button>
          </div>
          <div class="card stack" style="margin-top:1rem">
            <div class="stat-row">
              <div class="stat"><strong class="mono">${fmt(score.z, 2)}</strong><span>score z</span></div>
              <div class="stat"><strong class="mono ${score.p >= 0.5 ? "paul-text" : "lennon-text"}">${fmt(score.p, 3)}</strong><span>P(McCartney)</span></div>
            </div>
            <div><div class="gauge"><i style="left:${score.p * 100}%"></i></div><div class="gauge-labels"><span class="lennon-text">Lennon</span><span class="paul-text">McCartney</span></div></div>
            <svg viewBox="0 0 ${curveWidth} ${curveHeight}" role="img" aria-label="Sigmoid curve">
              <line x1="${zx(0)}" x2="${zx(0)}" y1="6" y2="${curveHeight - 20}" stroke="#ddd5c6"/>
              <polyline points="${curve.join(" ")}" fill="none" stroke="#1d1c1a" stroke-width="2"/>
              <circle cx="${zx(clamped)}" cy="${py(sigmoid(clamped))}" r="6" fill="${score.p >= 0.5 ? "#c4462b" : "#2a5ea8"}"/>
              <text x="${zx(-6)}" y="${curveHeight - 4}" font-size="10" fill="#6b665d">z = −6</text>
              <text x="${zx(6)}" y="${curveHeight - 4}" font-size="10" text-anchor="end" fill="#6b665d">z = +6</text>
            </svg>
          </div>
        </div>
        <div class="card">
          <div class="feature-checks">${groups}</div>
          <p class="small-print" style="margin-bottom:0">Song A and B were extracted with our simplified rules, so treat their scores as an illustration. The real model saw the authors' hand-coded features of whole songs.</p>
        </div>
      </div>`;
    },
  },
  {
    section: "Model",
    render: () => `
      <div class="slide two-col">
        <div>
          <p class="kicker">Step 2 · keeping the weights small</p>
          <h2>Elastic net: shrink <em>and</em> select</h2>
          <p>Training minimizes the average log loss <em>plus</em> a penalty on the weights:</p>
          <p class="mono" style="font-size:0.98rem">loss + λ [ (1−α)·½ Σ w<sub>j</sub>² + α·Σ |w<sub>j</sub>| ]</p>
          <ul>
            <li><strong>α = 0 (ridge, L2)</strong>: squared weights. Every weight shrinks a bit, but none becomes exactly zero.</li>
            <li><strong>α = 1 (lasso, L1)</strong>: absolute values. The penalty region has <em>corners</em> on the axes, so the solution often lands exactly on one, which sets weights to zero.</li>
            <li>In between is the <strong>elastic net</strong>.</li>
          </ul>
          <p>λ sets how strong the penalty is. Both α and λ were picked by 5-fold cross-validation over an 11 × 100 grid. The winner was <strong>α = 0.3, λ = 0.0359</strong>, mostly ridge with some lasso, and it kept 29 of the 40 screened features.</p>
        </div>
        <div class="card stack">
          <div class="controls"><label>α</label><input type="range" min="0" max="1" step="0.05" value="${state.alpha}" data-input="alpha"><span id="alpha-value" class="mono"></span></div>
          <div class="controls"><label>budget</label><input type="range" min="0.3" max="2.6" step="0.05" value="${state.reach}" data-input="reach"><span class="small-print">(a stronger λ means a smaller budget)</span></div>
          <div id="enet-plot"></div>
          <p id="enet-caption" class="small-print"></p>
        </div>
      </div>`,
    update: (root) => {
      const solution = constrainedSolution(state.alpha, state.reach);
      const scale = 95;
      const ox = 120;
      const oy = 250;
      const sx = (w) => ox + w * scale;
      const sy = (w) => oy - w * scale;
      const boundary = [];
      for (let step = 0; step <= 360; step += 1) {
        const theta = (step / 360) * 2 * Math.PI;
        const radius = boundaryRadius(theta, state.alpha, state.reach);
        boundary.push(`${sx(radius * Math.cos(theta))},${sy(radius * Math.sin(theta))}`);
      }
      const [[p, q], [, r]] = LOSS_MATRIX;
      const l11 = Math.sqrt(p);
      const l21 = q / l11;
      const l22 = Math.sqrt(r - l21 * l21);
      const ellipse = (level) => {
        const points = [];
        for (let step = 0; step <= 120; step += 1) {
          const t = (step / 120) * 2 * Math.PI;
          const v2 = Math.sin(t) / l22;
          const v1 = (Math.cos(t) - l21 * v2) / l11;
          points.push(`${sx(LOSS_CENTER[0] + Math.sqrt(level) * v1)},${sy(LOSS_CENTER[1] + Math.sqrt(level) * v2)}`);
        }
        return points.join(" ");
      };
      const levels = solution.inside ? [0.3, 0.9, 1.8] : [solution.loss, solution.loss * 0.45, solution.loss * 1.8];
      root.querySelector("#alpha-value").textContent = `${fmt(state.alpha, 2)} ${state.alpha === 0 ? "(ridge)" : state.alpha === 1 ? "(lasso)" : ""}`;
      root.querySelector("#enet-plot").innerHTML = `
        <svg viewBox="0 0 470 400" role="img" aria-label="Penalty region and loss contours">
          <line x1="10" x2="460" y1="${oy}" y2="${oy}" stroke="#a39d92"/>
          <line x1="${ox}" x2="${ox}" y1="10" y2="390" stroke="#a39d92"/>
          <text x="455" y="${oy - 6}" text-anchor="end" font-size="12" fill="#6b665d">w₁</text>
          <text x="${ox + 6}" y="20" font-size="12" fill="#6b665d">w₂</text>
          <polygon points="${boundary.join(" ")}" fill="rgba(108,79,163,0.16)" stroke="#6c4fa3" stroke-width="2"/>
          ${levels.map((level, index) => `<polyline points="${ellipse(level)}" fill="none" stroke="#c4462b" stroke-width="${index === 0 ? 2 : 1}" stroke-dasharray="${index === 0 ? "" : "4 4"}" opacity="${index === 0 ? 1 : 0.55}"/>`).join("")}
          <circle cx="${sx(LOSS_CENTER[0])}" cy="${sy(LOSS_CENTER[1])}" r="4" fill="#c4462b"/>
          <text x="${sx(LOSS_CENTER[0]) + 8}" y="${sy(LOSS_CENTER[1]) - 6}" font-size="11" fill="#c4462b">best fit, no penalty</text>
          <circle cx="${sx(solution.w[0])}" cy="${sy(solution.w[1])}" r="7" fill="#1d1c1a"/>
          <text x="${sx(solution.w[0]) + 10}" y="${sy(solution.w[1]) + 18}" font-size="12" font-weight="700">penalized solution</text>
        </svg>`;
      root.querySelector("#enet-caption").innerHTML = `Purple: the weights the penalty allows. Red: contours of the training loss. The solution is the point in the purple region with the lowest loss. Here w₁ = <strong>${fmt(solution.w[0], 2)}</strong>, w₂ = <strong>${fmt(solution.w[1], 2)}</strong>${solution.w[1] === 0 ? ": the corner has set w₂ to exactly <strong>zero</strong>, so feature 2 is dropped." : "."}`;
    },
  },
  {
    section: "Model",
    render: () => {
      const strip = (held, color) => Array.from({ length: 70 }, (_, index) => `<span style="background:${index === held ? "#1d1c1a" : color}"></span>`).join("");
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Honest evaluation with very little data</p>
          <h2>Cross-validation inside cross-validation inside cross-validation</h2>
          <p>There are three hyperparameters (screening threshold, α, λ) and no data to spare for a separate test set. The rule from the evaluation chapter still applies: <strong>a song used to choose a setting must not also be used to score the model.</strong></p>
          <p>So the authors nest the loops. The outer loop holds out one song and treats it as the test set. <em>Everything</em> else, including every hyperparameter choice, happens using only the other 69.</p>
          <p class="small-print">That's roughly 70 × 5 × 69 ≈ 24,000 complete runs of the elastic-net tuning procedure, each of which fits 5 folds over the α–λ grid. It's cheap with 70 songs, but expensive in general.</p>
        </div>
        <div class="stack">
          <div class="nest outer">
            <h3>Outer loop · leave one song out (70 times)</h3>
            <p>Hide song i (black). Its prediction p̂ᵢ is the only thing this loop reports. These 70 out-of-sample predictions give the accuracy and ROC results that follow.</p>
            <div class="song-strip">${strip(12, "#b9ae9a")}</div>
            <div class="nest middle">
              <h3>Middle loop · choose the screening threshold</h3>
              <p>For each threshold in {1, 0.75, 0.5, 0.25, 0.1}, run leave-one-out on the 69 remaining songs (68 to train, 1 to test) and pick the threshold with the lowest held-out log loss. The choice was 0.25 in 69 of 70 outer rounds.</p>
              <div class="nest inner">
                <h3>Inner loop · choose α and λ</h3>
                <p>For the songs at hand, run stratified 5-fold cross-validation over 11 α values × 100 λ values and keep the pair with the lowest held-out log loss.</p>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    },
  },
  {
    section: "Results",
    render: () => `
      <div class="slide two-col">
        <div>
          <p class="kicker">Results · real numbers from the paper</p>
          <h2>How well does it work?</h2>
          <p>Each dot is one of the 70 songs, placed at its <em>out-of-sample</em> probability of being by McCartney, computed while that song was hidden.</p>
          <p>Move the threshold. Songs to the right of it are predicted McCartney. Ringed dots are mistakes. Hover a dot to see the song.</p>
          <div class="controls"><label>Threshold</label><input type="range" min="0.01" max="0.99" step="0.01" value="${state.threshold}" data-input="threshold"><span id="threshold-value" class="mono"></span></div>
          <div id="confusion" style="margin-top:1rem"></div>
        </div>
        <div class="card" id="strip-plot"></div>
      </div>`,
    update: (root) => {
      const songs = scoredSongs();
      const matrix = confusion(songs, state.threshold);
      const width = 760;
      const left = 110;
      const right = 20;
      const x = (p) => left + p * (width - left - right);
      const bins = new Map();
      const placed = songs.map((song) => {
        const key = `${song.y}:${Math.round(song.p * 40)}`;
        const stack = bins.get(key) || 0;
        bins.set(key, stack + 1);
        return { ...song, stack };
      });
      const rowY = (y, stack) => (y === 0 ? 130 - stack * 15 : 175 + stack * 15);
      root.querySelector("#threshold-value").textContent = fmt(state.threshold, 2);
      root.querySelector("#strip-plot").innerHTML = `
        <svg viewBox="0 0 ${width} 300" role="img" aria-label="Out-of-sample predictions for 70 songs">
          <text x="${left - 12}" y="104" text-anchor="end" font-size="14" font-weight="700" fill="#2a5ea8">Lennon</text>
          <text x="${left - 12}" y="120" text-anchor="end" font-size="11" fill="#6b665d">39 songs</text>
          <text x="${left - 12}" y="200" text-anchor="end" font-size="14" font-weight="700" fill="#c4462b">McCartney</text>
          <text x="${left - 12}" y="216" text-anchor="end" font-size="11" fill="#6b665d">31 songs</text>
          <rect x="${x(state.threshold)}" y="10" width="${x(1) - x(state.threshold)}" height="245" fill="#f7e0d8" opacity="0.6"/>
          <text x="${x(1) - 4}" y="24" text-anchor="end" font-size="11" fill="#c4462b">predicted McCartney →</text>
          <text x="${x(0) + 4}" y="24" font-size="11" fill="#2a5ea8">← predicted Lennon</text>
          <line x1="${x(state.threshold)}" x2="${x(state.threshold)}" y1="10" y2="255" stroke="#1d1c1a" stroke-width="2"/>
          ${placed.map((song) => {
            const wrong = (song.p >= state.threshold ? 1 : 0) !== song.y;
            const color = song.y === 1 ? "#c4462b" : "#2a5ea8";
            return `<circle cx="${x(song.p)}" cy="${rowY(song.y, song.stack)}" r="6" fill="${color}" stroke="${wrong ? "#1d1c1a" : "white"}" stroke-width="${wrong ? 2.5 : 1}"><title>${escapeHTML(song.name)} (${song.y ? "McCartney" : "Lennon"}): ${fmt(song.p)}</title></circle>`;
          }).join("")}
          ${probabilityAxis(x, width, 262)}
        </svg>`;
      root.querySelector("#confusion").innerHTML = `
        <table class="confusion">
          <thead><tr><th></th><th>predicted Lennon</th><th>predicted McCartney</th></tr></thead>
          <tbody>
            <tr><th class="lennon-text">Lennon</th><td class="ok">${matrix.tn}</td><td class="bad">${matrix.fp}</td></tr>
            <tr><th class="paul-text">McCartney</th><td class="bad">${matrix.fn}</td><td class="ok">${matrix.tp}</td></tr>
          </tbody>
        </table>
        <p>Accuracy <strong class="mono">${fmt(matrix.accuracy * 100, 1)}%</strong> · Lennon correct ${matrix.tn}/39 · McCartney correct ${matrix.tp}/31</p>
        <p class="small-print">At the threshold 0.5 used in the paper: 75.7% overall (76.9% of Lennon songs, 74.2% of McCartney songs). Always guessing Lennon would score 55.7%.</p>`;
    },
  },
  {
    section: "Results",
    render: () => `
      <div class="slide two-col">
        <div>
          <p class="kicker">Results · threshold-free</p>
          <h2>The ROC curve</h2>
          <p>Each threshold gives one (false-positive rate, true-positive rate) pair, with McCartney as the positive class. Sweeping the threshold from 1 down to 0 traces the curve.</p>
          <p>The area under it (AUC, also called the <em>c-statistic</em>) is the probability that a randomly chosen McCartney song gets a higher score than a randomly chosen Lennon song.</p>
          <div class="controls"><label>Threshold</label><input type="range" min="0.01" max="0.99" step="0.01" value="${state.threshold}" data-input="threshold"><span id="roc-threshold" class="mono"></span></div>
          <p id="auc-text" class="note-box" style="margin-top:1rem"></p>
        </div>
        <div class="card" id="roc-plot"></div>
      </div>`,
    update: (root) => {
      const songs = scoredSongs();
      const curve = rocCurve(songs);
      const point = confusion(songs, state.threshold);
      const size = 380;
      const pad = 44;
      const sx = (v) => pad + v * (size - pad - 12);
      const sy = (v) => size - pad - v * (size - pad - 12);
      const path = curve.map((item) => `${sx(item.fpr)},${sy(item.tpr)}`).join(" ");
      root.querySelector("#roc-threshold").textContent = fmt(state.threshold, 2);
      root.querySelector("#roc-plot").innerHTML = `
        <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="ROC curve">
          <polygon points="${sx(0)},${sy(0)} ${path} ${sx(1)},${sy(0)}" fill="rgba(196,70,43,0.12)"/>
          <line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(1)}" y2="${sy(1)}" stroke="#a39d92" stroke-dasharray="4 4"/>
          <polyline points="${path}" fill="none" stroke="#c4462b" stroke-width="2.5"/>
          <rect x="${sx(0)}" y="${sy(1)}" width="${sx(1) - sx(0)}" height="${sy(0) - sy(1)}" fill="none" stroke="#6b665d"/>
          <circle cx="${sx(point.fpr)}" cy="${sy(point.tpr)}" r="7" fill="#1d1c1a"/>
          <text x="${sx(0.5)}" y="${size - 10}" text-anchor="middle" font-size="12" fill="#6b665d">false-positive rate (Lennon songs called McCartney)</text>
          <text transform="translate(14 ${sy(0.5)}) rotate(-90)" text-anchor="middle" font-size="12" fill="#6b665d">true-positive rate (McCartney found)</text>
          ${[0, 0.5, 1].map((v) => `<text x="${sx(v)}" y="${sy(0) + 16}" text-anchor="middle" font-size="10" fill="#6b665d">${v}</text><text x="${sx(0) - 8}" y="${sy(v) + 4}" text-anchor="end" font-size="10" fill="#6b665d">${v}</text>`).join("")}
          <text x="${sx(0.55)}" y="${sy(0.32)}" font-size="11" fill="#a39d92">random guessing</text>
        </svg>`;
      root.querySelector("#auc-text").innerHTML = `AUC computed from the 70 published predictions: <strong class="mono">${fmt(auc(songs), 3)}</strong> (the paper reports 0.837). At this threshold: TPR ${fmt(point.tpr, 2)}, FPR ${fmt(point.fpr, 2)}.`;
    },
  },
  {
    section: "Results",
    render: () => {
      const rows = [...PAPER.COEFFICIENTS].sort((a, b) => (state.coefficientSort === "weight" ? a.weight - b.weight : a.c - b.c));
      const width = 760;
      const labelEnd = 318;
      const mid = labelEnd + 165;
      const scale = 120;
      const rowHeight = 19;
      const height = rows.length * rowHeight + 40;
      const familyColor = (family) => FAMILY_COLORS[family];
      return `
      <div class="slide two-col">
        <div>
          <p class="kicker">Interpreting the weights</p>
          <h2>What did the model learn?</h2>
          <p>Logistic regression is easy to read. Each weight says how much a feature's presence shifts the log-odds toward <span class="paul-text">McCartney (+)</span> or <span class="lennon-text">Lennon (−)</span>.</p>
          <ul>
            <li><span class="lennon-text">Lennon</span> more often moves <strong>I ↔ vi</strong>, steps along the scale, and ends phrases on 5.</li>
            <li><span class="paul-text">McCartney</span> uses more <strong>ii ↔ IV</strong> changes, the 4th, the blue note <strong>♭3</strong> (and ♭3 → 1), and leaps from or to off-scale notes.</li>
          </ul>
          <p>The authors note this goes against the popular idea that Lennon was the bluesy rock-and-roller. By these features, McCartney's writing is the more adventurous.</p>
          <p class="small-print">The c-statistic (right column) is the AUC when that feature is removed and the whole procedure is rerun. Lower means the feature mattered more; the full model has 0.837.</p>
          <div class="controls"><label>Sort by</label><button type="button" class="small ${state.coefficientSort === "weight" ? "on" : ""}" data-action="coef-sort" data-value="weight">weight</button><button type="button" class="small ${state.coefficientSort === "c" ? "on" : ""}" data-action="coef-sort" data-value="c">importance</button></div>
        </div>
        <div class="card">
          <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Coefficients of the final model">
            <text x="${mid - 8}" y="14" text-anchor="end" font-size="11" font-weight="700" fill="#2a5ea8">← Lennon</text>
            <text x="${mid + 8}" y="14" font-size="11" font-weight="700" fill="#c4462b">McCartney →</text>
            <text x="${width - 4}" y="14" text-anchor="end" font-size="10" fill="#6b665d">c-stat</text>
            <line x1="${mid}" x2="${mid}" y1="20" y2="${height - 14}" stroke="#1d1c1a"/>
            ${rows.map((row, index) => {
              const y = 24 + index * rowHeight;
              const barWidth = Math.abs(row.weight) * scale;
              const x0 = row.weight >= 0 ? mid : mid - barWidth;
              return `
                <rect x="${x0}" y="${y}" width="${barWidth}" height="${rowHeight - 5}" rx="2" fill="${row.weight >= 0 ? "#c4462b" : "#2a5ea8"}" opacity="${row.c < 0.8 ? 1 : 0.55}"><title>${escapeHTML(row.label)}: ${row.weight}</title></rect>
                <text x="${labelEnd}" y="${y + 11}" text-anchor="end" font-size="10.5" fill="#1d1c1a"><tspan fill="${familyColor(row.family)}">■</tspan> ${escapeHTML(row.label)}</text>
                <text x="${width - 4}" y="${y + 11}" text-anchor="end" font-size="10" fill="${row.c < 0.8 ? "#1d1c1a" : "#a39d92"}" font-weight="${row.c < 0.8 ? 700 : 400}">${fmt(row.c)}</text>`;
            }).join("")}
          </svg>
          <p class="small-print" style="margin:0.3rem 0 0">Solid bars: the five most important features (c-stat &lt; 0.80). The colored square shows the feature family.</p>
        </div>
      </div>`;
    },
  },
  {
    section: "Results",
    render: () => `
      <div class="slide two-col">
        <div>
          <p class="kicker">The payoff</p>
          <h2>The disputed songs</h2>
          <p>Fit the procedure on all 70 known songs, then score the 8 disputed ones. The bars show how much the prediction moves when the model is refit 70 times, each time leaving out one training song.</p>
          <ul>
            <li>All eight lean <span class="lennon-text">Lennon</span>, which matches most accounts.</li>
            <li><strong>“In My Life”</strong>: the verse looks clearly like Lennon (0.19). The bridge is much less certain (0.44, interval crossing 0.5), which fits Lennon's own story that McCartney helped with the middle eight.</li>
            <li><strong>“Wait”</strong> is sung by both, except for a bridge McCartney sings alone. Scored on its own, that bridge gives <strong>0.646</strong>, leaning McCartney.</li>
          </ul>
        </div>
        <div class="card">${intervalChart(PAPER.DISPUTED_SONGS)}</div>
      </div>`,
  },
  {
    section: "Results",
    render: () => `
      <div class="slide two-col">
        <div>
          <p class="kicker">Out of distribution</p>
          <h2>Songs they wrote together</h2>
          <p>The model was trained only on single-author songs. Asking it about a co-written song is like asking a cat-vs-dog classifier about a fox: it will still give an answer.</p>
          <p>Some results line up with history. Lennon said the idea for <strong>“She Loves You”</strong> was Paul's, and it scores 0.62. <strong>“I Want to Hold Your Hand”</strong> was written “eyeball to eyeball” but scores very Lennon-like (0.12).</p>
          <p>Others are puzzling. Lennon said <strong>“The Word”</strong> was mostly his, yet it scores 0.98, probably because it is full of ♭3 notes, one of the strongest McCartney features.</p>
          <p class="note-box">A probability here means “this music resembles the training songs of that author.” It does not reveal who actually wrote it.</p>
        </div>
        <div class="card">${intervalChart(PAPER.COLLABORATIVE_SONGS)}</div>
      </div>`,
  },
  {
    section: "Wrap-up",
    render: () => `
      <div class="slide two-col even">
        <div>
          <p class="kicker">Reading the result critically</p>
          <h2>What the paper does <em>not</em> show</h2>
          <ul>
            <li><strong>Style is not authorship.</strong> McCartney might have written “In My Life” and deliberately written it the way Lennon would.</li>
            <li><strong>Small data, many choices.</strong> The authors tried interactions, random forests, stepwise selection, Naive-Bayes-style models and more before settling on this one. Trying many models on the same 70 songs is a quiet form of overfitting. They acknowledge this and limited their search for that reason.</li>
            <li><strong>Subjective coding.</strong> Where does a phrase end? Do ad-libs count? What about two melodies sung in harmony? Every such choice changes the features.</li>
            <li><strong>Information left out on purpose.</strong> Lyrics, rhythm, tempo and who sings would all help prediction, but the goal was a purely <em>musical</em> fingerprint.</li>
            <li><strong>Short fragments</strong>, such as a bridge, light up few features, so their predictions are less reliable.</li>
          </ul>
        </div>
        <div class="stack">
          <div class="card">
            <h3>The pipeline, in one picture</h3>
            <div class="tokens" style="align-items:center;font-family:var(--sans)">
              <span class="chip">sheet music</span>→<span class="chip">transpose to scale degrees</span>→<span class="chip">5 feature families, collapsed into bins</span>→<span class="chip">0/1 presence</span>→<span class="chip">drop rare/common</span>→<span class="chip">χ² screening</span>→<span class="chip">elastic-net logistic regression</span>→<span class="chip">P(McCartney)</span>
            </div>
          </div>
          <div class="card">
            <h3>The headline numbers</h3>
            <div class="stat-row">
              <div class="stat"><strong>75.7%</strong><span>leave-one-out accuracy</span></div>
              <div class="stat"><strong>0.837</strong><span>AUC</span></div>
              <div class="stat"><strong>29</strong><span>features used</span></div>
              <div class="stat"><strong>70</strong><span>training songs</span></div>
            </div>
          </div>
        </div>
      </div>`,
  },
  {
    section: "Wrap-up",
    render: () => `
      <div class="slide two-col even">
        <div>
          <p class="kicker">Connections to the course</p>
          <h2>Everything here is something you've seen</h2>
          <ul>
            <li><strong>Feature design.</strong> Tokens, unigrams, bigrams and boundary symbols, applied to notes and chords instead of words.</li>
            <li><strong>Normalization.</strong> Transposing to scale degrees is the musical version of lowercasing.</li>
            <li><strong>Sparsity vs. detail.</strong> Collapsing categories plays the same role as limiting the vocabulary or n-gram order.</li>
            <li><strong>Binary features.</strong> Presence/absence instead of counts, as in Bernoulli Naive Bayes.</li>
            <li><strong>Logistic regression, L1/L2 regularization.</strong> Interpretable weights, and a penalty for when there are more features than examples.</li>
            <li><strong>Evaluation.</strong> Leave-one-out and nested cross-validation, confusion matrices, ROC/AUC.</li>
          </ul>
        </div>
        <div class="card">
          <h3>Questions to discuss</h3>
          <ol class="q-list">
            <li>Song A and Song B were invented. Using the weights on the logistic regression slide, write down a short phrase you'd expect to score as very “McCartney.” Which features does it need?</li>
            <li>Why might presence/absence beat counts for songs, when counts usually win for long text documents?</li>
            <li>The threshold 0.25 was chosen in 69 of 70 outer folds. What does that stability tell you? What would you worry about if it had changed every time?</li>
            <li>Suppose the authors had picked the screening threshold using all 70 songs and <em>then</em> run leave-one-out to report accuracy. Why would the reported accuracy be too optimistic?</li>
            <li>How would you extend the model to three songwriters (adding George Harrison)?</li>
          </ol>
        </div>
      </div>`,
  },
];

const ACTIONS = {
  example: (value) => {
    state.example = value;
    state.chordStep = 0;
    state.moveStep = 0;
    state.contourStep = 0;
  },
  transpose: (value) => { state.transpose = Number(value); },
  keyboard: (value) => { state.keyboardTonic = Number(value); },
  "chord-chip": (value) => { state.chordChip = Number(value); },
  "chord-step": (value) => { state.chordStep = Math.max(0, state.chordStep + Number(value)); },
  "move-step": (value) => { state.moveStep = Math.max(0, state.moveStep + Number(value)); },
  "contour-step": (value) => { state.contourStep = Math.max(0, state.contourStep + Number(value)); },
  "count-mode": (value) => { state.countMode = value; },
  "filter-matrix": () => { state.filterMatrix = !state.filterMatrix; },
  screen: (value) => {
    const [who, delta] = value.split(":");
    const limit = who === "lennon" ? 39 : 31;
    state.screen[who] = Math.max(0, Math.min(limit, state.screen[who] + Number(delta)));
  },
  "screen-preset": (value) => {
    const [lennon, paul] = value.split(":").map(Number);
    state.screen = { lennon, paul };
  },
  "toggle-feature": (value) => {
    if (state.checked.has(value)) state.checked.delete(value);
    else state.checked.add(value);
  },
  "checked-preset": (value) => {
    state.checked = value === "none"
      ? new Set()
      : new Set(PAPER.COEFFICIENTS.filter((c) => extractFeatures(EXAMPLES[value]).present.has(c.id)).map((c) => c.id));
  },
  "coef-sort": (value) => { state.coefficientSort = value; },
};

if (typeof module !== "undefined") {
  module.exports = {
    DEGREES,
    EXAMPLES,
    SLIDES,
    chordCategory,
    chordTransition,
    melodicMove,
    extractFeatures,
    featureUniverse,
    modelScore,
    scoredSongs,
    confusion,
    rocCurve,
    auc,
    screeningTest,
    constrainedSolution,
    illustrativeMatrix,
  };
}

if (typeof document !== "undefined") {
  const elements = {
    slide: document.querySelector("#slide"),
    sectionLabel: document.querySelector("#section-label"),
    progress: document.querySelector("#progress"),
    counter: document.querySelector("#counter"),
    previous: document.querySelector("#previous"),
    next: document.querySelector("#next"),
  };
  let current = 0;
  let furthest = 0;

  function renderProgress() {
    elements.progress.replaceChildren();
    const sections = [...new Set(SLIDES.map((slide) => slide.section))];
    for (const section of sections) {
      const group = document.createElement("div");
      group.className = "progress-section";
      const label = document.createElement("span");
      label.textContent = section;
      group.append(label);
      SLIDES.forEach((slide, index) => {
        if (slide.section !== section) return;
        const button = document.createElement("button");
        button.type = "button";
        button.title = `Slide ${index + 1}`;
        button.setAttribute("aria-label", `Go to slide ${index + 1}`);
        button.classList.toggle("active", index === current);
        button.classList.toggle("seen", index !== current && index <= furthest);
        button.addEventListener("click", () => go(index));
        group.append(button);
      });
      elements.progress.append(group);
    }
  }

  function render(resetScroll = false) {
    const slide = SLIDES[current];
    elements.slide.innerHTML = slide.render();
    if (slide.update) slide.update(elements.slide);
    if (resetScroll) elements.slide.scrollTop = 0;
    elements.sectionLabel.textContent = slide.section;
    elements.counter.textContent = `${current + 1} / ${SLIDES.length}`;
    elements.previous.disabled = current === 0;
    elements.next.disabled = current === SLIDES.length - 1;
    renderProgress();
  }

  function go(index) {
    current = Math.max(0, Math.min(SLIDES.length - 1, index));
    furthest = Math.max(furthest, current);
    if (location.hash !== `#${current + 1}`) history.replaceState(null, "", `#${current + 1}`);
    render(true);
  }

  elements.slide.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.type === "checkbox") return;
    ACTIONS[target.dataset.action](target.dataset.value);
    render();
  });

  elements.slide.addEventListener("change", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.type !== "checkbox") return;
    ACTIONS[target.dataset.action](target.dataset.value);
    render();
  });

  elements.slide.addEventListener("input", (event) => {
    const target = event.target.closest("[data-input]");
    if (!target) return;
    state[target.dataset.input] = Number(target.value);
    SLIDES[current].update(elements.slide);
  });

  elements.previous.addEventListener("click", () => go(current - 1));
  elements.next.addEventListener("click", () => go(current + 1));

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, select, textarea")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (["ArrowRight", "PageDown"].includes(event.key) || (event.key === " " && !event.target.matches("button"))) {
      event.preventDefault();
      go(current + 1);
    } else if (["ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      go(current - 1);
    } else if (event.key === "Home") {
      go(0);
    } else if (event.key === "End") {
      go(SLIDES.length - 1);
    }
  });

  const initial = Number.parseInt(location.hash.slice(1), 10);
  go(Number.isFinite(initial) ? initial - 1 : 0);
}
