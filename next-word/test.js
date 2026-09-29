"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { NextWordModel, tokenize } = require("./app.js");

const outputDirectory = path.join(__dirname, "output");
const metadata = JSON.parse(fs.readFileSync(path.join(outputDirectory, "model.json"), "utf8"));
const buffer = fs.readFileSync(path.join(outputDirectory, metadata.binary));
const binary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const model = new NextWordModel(metadata, binary);

assert.deepEqual(tokenize("It's Florida."), ["it's", "florida", "."]);
assert.deepEqual(model.contextFor("at the very end of"), ["the", "very", "end", "of"]);

const prediction = model.predict("at the end of", 5);
assert.equal(prediction.predictions[0].token, "the");
assert.ok(Math.abs(prediction.predictions[0].probability - 0.477) < 0.01);
assert.equal(prediction.predictions.length, 5);

const neighbors = model.nearestNeighbors("king", 5);
assert.equal(neighbors.token, "king");
assert.equal(neighbors.neighbors.length, 5);
assert.ok(neighbors.neighbors[0].similarity <= 1);

console.log("Browser model smoke test passed.");
console.log("Top prediction for ‘at the end of’:", prediction.predictions[0]);
console.log("Nearest embedding neighbors to ‘king’:", neighbors.neighbors);
