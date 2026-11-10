"use strict";

const assert = require("node:assert/strict");
const {
  CODE_LINES,
  EXAMPLE,
  extractFeatures,
  buildVocabulary,
  vectorize,
  toCSR,
  renderScene,
} = require("./app.js");

const market = extractFeatures(EXAMPLE, 3);
assert.equal(market.tag, "NN");
assert.deepEqual(market.features, {
  market: 1,
  "p1:software": 1,
  "LCW:market": 1,
  "p2:u.s.": 1,
  "t#": 1,
  "et#": 1,
  "ket#": 1,
  "rket#": 1,
  "arket#": 1,
  "n:expanded": 1,
});

const rows = EXAMPLE.slice(0, 5).map((_, index) => extractFeatures(EXAMPLE, index).features);
const vocabulary = buildVocabulary(rows);
const matrix = vectorize(rows, vocabulary);
assert.equal(matrix.length, 5);
assert.equal(matrix[0].length, vocabulary.length);
assert.equal(matrix[3][vocabulary.indexOf("market")], 1);
assert.equal(matrix[3][vocabulary.indexOf("INITCAP")], 0);

const csr = toCSR(matrix);
assert.equal(csr.indptr.length, matrix.length + 1);
assert.equal(csr.data.length, csr.indices.length);
assert.equal(csr.indptr.at(-1), csr.data.length);
assert.equal(csr.data.reduce((sum, value) => sum + value, 0), matrix.flat().reduce((sum, value) => sum + value, 0));

const scenes = new Set(CODE_LINES.filter((line) => line.text.trim()).map((line) => line.scene));
for (const scene of scenes) {
  const html = renderScene(scene);
  assert.equal(typeof html, "string");
  assert.ok(html.includes("class=\"scene\""), `scene did not render: ${scene}`);
}

console.log(`All tests passed across ${CODE_LINES.filter((line) => line.text.trim()).length} navigable code lines.`);
