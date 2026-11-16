"use strict";

const assert = require("node:assert/strict");
const {
  CODE_LINES,
  COUNT_MATRIX,
  PPMI_MATRIX,
  ppmiValue,
  buildCooccurrence,
  renderScene,
} = require("./app.js");

const toy = buildCooccurrence(["a", "b", "c"], 1);
assert.deepEqual(toy, [
  [0, 1, 0],
  [1, 0, 1],
  [0, 1, 0],
]);

assert.equal(ppmiValue(0, 10, 10, 100), 0);
assert.ok(Math.abs(ppmiValue(12, 864, 2313, 3849232) - 4.5306646448) < 1e-9);
assert.equal(COUNT_MATRIX[4][5], 12);
assert.equal(PPMI_MATRIX[4][5], 4.53);

const scenes = [...new Set(CODE_LINES.filter((line) => line.text.trim()).map((line) => line.scene))];
scenes.forEach((scene) => {
  const html = renderScene(scene);
  assert.match(html, /class="scene"/);
  assert.ok(html.length > 80, `${scene} should produce a substantive explanation`);
});

console.log(`All tests passed across ${CODE_LINES.filter((line) => line.text.trim()).length} navigable code lines.`);
