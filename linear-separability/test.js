"use strict";

const assert = require("node:assert/strict");
const { DATASETS, createTrainer, accuracy, rbf } = require("./app.js");

const defaults = {
  learningRate: 0.15,
  epochs: 60,
  lambda: 0.01,
  gamma: 4,
  ensembleSize: 20,
  neighbors: 5,
  hiddenUnits: 5,
  activation: "tanh",
};

function finish(kind, points, overrides = {}) {
  const trainer = createTrainer(kind, points, { ...defaults, ...overrides });
  let guard = 100000;
  while (!trainer.snapshot().done && guard > 0) {
    trainer.step();
    guard -= 1;
  }
  assert.ok(guard > 0, `${kind} should terminate`);
  return trainer.snapshot();
}

const firstClean = DATASETS.clean.make();
const secondClean = DATASETS.clean.make();
assert.deepEqual(firstClean, secondClean, "preset generation should be deterministic");
assert.deepEqual(DATASETS.spiral.make(), DATASETS.spiral.make(), "spiral generation should be deterministic");

const perceptron = finish("perceptron", firstClean);
assert.equal(accuracy(firstClean, perceptron.score), 1, "perceptron should separate the clean preset");

const xor = DATASETS.xor.make();
const linearXor = finish("perceptron", xor);
assert.ok(accuracy(xor, linearXor.score) < 0.9, "a linear perceptron should not solve XOR");

const kernelXor = finish("kernel-perceptron", xor, { gamma: 4, learningRate: 1 });
assert.ok(accuracy(xor, kernelXor.score) > 0.97, "an RBF perceptron should solve the XOR preset");

const naiveBayes = finish("gaussian-nb", DATASETS.overlap.make());
assert.ok(Number.isFinite(naiveBayes.score({ x: 0.2, y: -0.1 })), "Gaussian NB should return finite scores");

const ensemble = finish("ensemble", firstClean, { ensembleSize: 7 });
assert.equal(ensemble.epoch, 7, "each ensemble member should complete exactly one epoch");
assert.ok(accuracy(firstClean, ensemble.score) > 0.95, "the perceptron ensemble should classify the clean preset");

for (const kind of ["averaged", "logistic", "svm", "kernel-svm"]) {
  const model = finish(kind, firstClean);
  assert.ok(Number.isFinite(model.score({ x: 0.1, y: -0.2 })), `${kind} should return finite scores`);
  assert.ok(accuracy(firstClean, model.score) > 0.95, `${kind} should fit the clean preset`);
}

const circle = DATASETS.circle.make();
const kernelCircle = finish("kernel-perceptron", circle, { gamma: 4, learningRate: 1 });
assert.ok(accuracy(circle, kernelCircle.score) > 0.97, "an RBF perceptron should solve the ball-and-ring preset");

const knnCircle = finish("knn", circle, { neighbors: 5 });
assert.ok(accuracy(circle, knnCircle.score) > 0.97, "kNN should solve the ball-and-ring preset");

const spiral = DATASETS.spiral.make();
const knnSpiral = finish("knn", spiral, { neighbors: 5 });
assert.ok(accuracy(spiral, knnSpiral.score) > 0.9, "kNN should follow the interlocking spiral arms");

const leaveOneOutPair = [{ x: -0.5, y: 0, label: 1 }, { x: 0.5, y: 0, label: -1 }];
const oneNeighbor = finish("knn", leaveOneOutPair, { neighbors: 1 });
assert.ok(oneNeighbor.score(leaveOneOutPair[0]) < 0, "kNN evaluation should exclude the example itself");
assert.ok(oneNeighbor.score({ x: -0.5, y: 0 }) > 0, "kNN should retain all examples for a new query");

for (const activation of ["tanh", "sigmoid", "relu"]) {
  const neuralXor = finish("neural-network", xor, { epochs: 30, hiddenUnits: 5, activation });
  assert.ok(accuracy(xor, neuralXor.score) > 0.95, `a five-unit ${activation} network should solve the XOR preset`);
}

assert.equal(rbf({ x: 0, y: 0 }, { x: 0, y: 0 }, 4), 1, "an RBF self-similarity should equal one");

console.log("linear-separability core checks passed");
