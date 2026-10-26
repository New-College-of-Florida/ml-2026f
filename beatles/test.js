"use strict";

const assert = require("node:assert/strict");
const {
  EXAMPLES,
  SLIDES,
  chordCategory,
  chordTransition,
  melodicMove,
  extractFeatures,
  modelScore,
  scoredSongs,
  confusion,
  auc,
  screeningTest,
  constrainedSolution,
  illustrativeMatrix,
} = require("./app.js");

// Chord bins: sevenths collapse to triads, off-key chords share two bins.
assert.equal(chordCategory({ root: 7, quality: "7" }, 0).id, "chord:V");
assert.equal(chordCategory({ root: 9, quality: "m7" }, 0).id, "chord:vi");
assert.equal(chordCategory({ root: 10, quality: "maj" }, 0).id, "chord:ND-maj");
assert.equal(chordCategory({ root: 11, quality: "dim" }, 0).id, "chord:ND-min");
assert.equal(chordCategory({ root: 0, quality: "aug" }, 0).id, "chord:ND-maj");

// Chord changes: order matters among I, IV, V only.
assert.equal(chordTransition("V", "I").id, "ct:V>I");
assert.notEqual(chordTransition("V", "I").id, chordTransition("I", "V").id);
assert.equal(chordTransition("V", "ii").id, chordTransition("ii", "V").id);
assert.equal(chordTransition("ND-maj", "vi").id, "ct:ND>dia");

// Melodic moves in C major.
assert.equal(melodicMove(null, 64, 0).id, "mt:start:3");
assert.equal(melodicMove(67, null, 0).id, "mt:end:5");
assert.equal(melodicMove(63, 60, 0).id, "mt:pair:♭3>1");
assert.equal(melodicMove(64, 62, 0).id, "mt:step:down");
assert.equal(melodicMove(66, 67, 0).id, "mt:nd:half-up-to-dia");
assert.equal(melodicMove(68, 67, 0).id, "mt:nd:half-down-to-dia");
assert.equal(melodicMove(62, 68, 0).id, "mt:nd:leap-up");
assert.equal(melodicMove(69, 81, 0).id, "mt:rep:6");

// Features do not depend on the key.
for (const example of Object.values(EXAMPLES)) {
  const home = [...extractFeatures(example).present].sort();
  for (const shift of [-5, -2, 3, 6]) {
    assert.deepEqual([...extractFeatures(example, shift).present].sort(), home, "transposition should not change features");
  }
}

// The two examples were built to land on opposite sides under the paper's weights.
assert.ok(modelScore(extractFeatures(EXAMPLES.a).present).p > 0.9);
assert.ok(modelScore(extractFeatures(EXAMPLES.b).present).p < 0.1);
assert.ok(Math.abs(modelScore(new Set()).p - 1 / (1 + Math.exp(0.796))) < 1e-12);

// The published leave-one-out predictions reproduce the paper's summary numbers.
const songs = scoredSongs();
assert.equal(songs.length, 70);
const atHalf = confusion(songs, 0.5);
assert.equal(atHalf.tn, 30);
assert.equal(atHalf.tp, 23);
assert.equal(fixed(atHalf.accuracy, 3), "0.757");
assert.equal(fixed(auc(songs), 3), "0.837");

// Screening.
const flat = screeningTest(20, 16);
assert.ok(flat.p > 0.9, "equal rates should not be significant");
assert.ok(screeningTest(5, 14).p < 0.01);

// Lasso lands on a corner; ridge does not.
assert.equal(constrainedSolution(1, 1.2).w[1], 0);
assert.ok(constrainedSolution(0, 1.2).w[1] > 0.1);

// The illustrative matrix has exactly 16 too-rare or too-common columns.
const matrix = illustrativeMatrix();
assert.equal(matrix.counts.length, 137);
assert.equal(matrix.counts.filter((count) => count <= 5 || count >= 66).length, 16);

// Every slide renders without a DOM.
for (const slide of SLIDES) assert.equal(typeof slide.render(), "string");

function fixed(value, digits) {
  return value.toFixed(digits);
}

console.log("All tests passed.");
