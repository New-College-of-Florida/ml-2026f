"use strict";

const RED = 1;
const BLUE = -1;
const BOUNDS = 1.12;

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const first = Math.max(random(), 1e-12);
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function shuffle(length, random) {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

function clusteredPoint(random, centerX, centerY, spread, label) {
  return {
    x: Math.max(-1.04, Math.min(1.04, centerX + gaussian(random) * spread)),
    y: Math.max(-1.04, Math.min(1.04, centerY + gaussian(random) * spread)),
    label,
  };
}

const DATASETS = {
  clean: {
    label: "Clean split",
    note: "A generous empty lane separates the classes. Many straight boundaries work; the algorithms need not choose the same one.",
    make() {
      const random = mulberry32(11);
      const points = [];
      for (let index = 0; index < 38; index += 1) {
        points.push(clusteredPoint(random, -0.48, -0.28, 0.19, BLUE));
        points.push(clusteredPoint(random, 0.48, 0.28, 0.19, RED));
      }
      return points;
    },
  },
  narrow: {
    label: "Narrow margin",
    note: "The data are almost separable, but several examples sit close to the best line. Watch a perceptron boundary hop as those points demand corrections.",
    make() {
      const random = mulberry32(29);
      const points = [];
      for (let index = 0; index < 48; index += 1) {
        const x = -0.96 + random() * 1.92;
        const boundary = 0.52 * x - 0.02;
        const label = index % 2 === 0 ? RED : BLUE;
        const gap = 0.055 + random() * 0.18;
        points.push({ x, y: boundary + label * gap + gaussian(random) * 0.035, label });
      }
      return points;
    },
  },
  overlap: {
    label: "Overlapping clouds",
    note: "The classes overlap. No boundary can classify every point correctly, so mistake-driven training never reaches a zero-error epoch.",
    make() {
      const random = mulberry32(47);
      const points = [];
      for (let index = 0; index < 48; index += 1) {
        points.push(clusteredPoint(random, -0.2, -0.08, 0.34, BLUE));
        points.push(clusteredPoint(random, 0.2, 0.08, 0.34, RED));
      }
      return points;
    },
  },
  xor: {
    label: "XOR",
    note: "Opposite corners share a label. Any straight line leaves at least one corner on the wrong side; an RBF kernel can wrap around the pattern.",
    make() {
      const random = mulberry32(71);
      const points = [];
      const centers = [
        [-0.55, -0.55, RED], [0.55, 0.55, RED],
        [-0.55, 0.55, BLUE], [0.55, -0.55, BLUE],
      ];
      centers.forEach(([x, y, label]) => {
        for (let index = 0; index < 24; index += 1) points.push(clusteredPoint(random, x, y, 0.13, label));
      });
      return points;
    },
  },
  circle: {
    label: "Ball and ring",
    note: "Red points form a ball inside a blue ring. This is not linearly separable in the original two features, but it becomes easy with a nonlinear similarity.",
    make() {
      const random = mulberry32(97);
      const points = [];
      for (let index = 0; index < 50; index += 1) {
        const angle = random() * 2 * Math.PI;
        const radius = Math.sqrt(random()) * 0.35;
        points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, label: RED });
      }
      for (let index = 0; index < 70; index += 1) {
        const angle = random() * 2 * Math.PI;
        const radius = 0.66 + random() * 0.27;
        points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, label: BLUE });
      }
      return points;
    },
  },
  spiral: {
    label: "Interlocking spirals",
    note: "Two class arms wind around each other. No straight line can untangle them, and even flexible models must trace several alternating turns.",
    make() {
      const random = mulberry32(131);
      const points = [];
      const pointsPerArm = 70;
      for (let index = 0; index < pointsPerArm; index += 1) {
        const progress = index / (pointsPerArm - 1);
        const angle = 0.35 + progress * 3.15 * Math.PI;
        const radius = 0.08 + progress * 0.9;
        const jitterX = gaussian(random) * 0.018;
        const jitterY = gaussian(random) * 0.018;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        points.push({ x: x + jitterX, y: y + jitterY, label: RED });
        points.push({ x: -x + jitterX, y: -y + jitterY, label: BLUE });
      }
      return points;
    },
  },
};

const ALGORITHM_INFO = {
  perceptron: "Updates only after a mistake. A score of exactly zero predicts blue, matching the textbook's binary rule.",
  averaged: "Trains an ordinary perceptron, but predicts with the average of every weight state visited during training.",
  ensemble: "Trains several perceptrons for one shuffled epoch each, then sums their final weight vectors.",
  logistic: "Uses the smooth logistic loss. Every example can move the boundary, though confident correct examples move it very little.",
  svm: "Uses hinge loss and L2 shrinkage. Examples beyond the margin make no loss-driven update; the bias is not regularized.",
  "gaussian-nb": "Fits class means, variances, and priors directly. It is a closed-form comparison, not an SGD algorithm.",
  knn: "Stores the training examples. A new point receives the majority label among its k nearest neighbors—there is no training step.",
  "neural-network": "Projects the two inputs through a learned nonlinear hidden layer, then separates that new representation with one sigmoid output unit.",
  "kernel-perceptron": "A perceptron whose score is a weighted sum of RBF similarities to training examples.",
  "kernel-svm": "Hinge-loss SGD in an RBF similarity space. Its boundary can curve in the original two-dimensional view.",
};

const ALGORITHM_CONTROLS = {
  perceptron: ["learning-rate", "epochs", "speed"],
  averaged: ["learning-rate", "epochs", "speed"],
  ensemble: ["learning-rate", "ensemble-size", "speed"],
  logistic: ["learning-rate", "epochs", "lambda", "speed"],
  svm: ["learning-rate", "epochs", "lambda", "speed"],
  "gaussian-nb": [],
  knn: ["neighbors"],
  "neural-network": ["learning-rate", "epochs", "hidden-units", "activation", "speed"],
  "kernel-perceptron": ["learning-rate", "epochs", "gamma", "speed"],
  "kernel-svm": ["learning-rate", "epochs", "lambda", "gamma", "speed"],
};

function dot(weights, point) {
  return weights[0] + weights[1] * point.x + weights[2] * point.y;
}

function addLinearUpdate(weights, point, amount) {
  weights[0] += amount;
  weights[1] += amount * point.x;
  weights[2] += amount * point.y;
}

function rbf(left, right, gamma) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.exp(-gamma * (dx * dx + dy * dy));
}

function predict(score) {
  return score > 0 ? RED : BLUE;
}

function makeOrders(pointCount, epochs, random) {
  return Array.from({ length: epochs }, () => shuffle(pointCount, random));
}

function linearTrainer(kind, points, settings, random) {
  const weights = [0, 0, 0];
  const averagedWeights = [0, 0, 0];
  let averageCount = 0;
  const orders = makeOrders(points.length, settings.epochs, random);
  let epoch = 0;
  let position = 0;
  let epochErrors = 0;
  let updates = 0;
  let done = points.length === 0;
  let currentIndex = null;

  function deployedWeights() {
    if (kind === "averaged" && averageCount > 0) return averagedWeights.map((value) => value / averageCount);
    return weights;
  }

  function score(point) { return dot(deployedWeights(), point); }

  function step() {
    if (done) return snapshot();
    currentIndex = orders[epoch][position];
    const point = points[currentIndex];
    const rawScore = dot(weights, point);
    const margin = point.label * rawScore;
    let changed = false;

    if (kind === "perceptron" || kind === "averaged") {
      if (margin <= 0) {
        addLinearUpdate(weights, point, settings.learningRate * point.label);
        changed = true;
        epochErrors += 1;
      }
    } else if (kind === "logistic") {
      const shrink = Math.max(0, 1 - settings.learningRate * settings.lambda);
      weights[1] *= shrink;
      weights[2] *= shrink;
      const factor = margin >= 0
        ? Math.exp(-margin) / (1 + Math.exp(-margin))
        : 1 / (1 + Math.exp(margin));
      addLinearUpdate(weights, point, settings.learningRate * factor * point.label);
      changed = true;
    } else if (kind === "svm") {
      const shrink = Math.max(0, 1 - settings.learningRate * settings.lambda);
      weights[1] *= shrink;
      weights[2] *= shrink;
      if (margin < 1) {
        addLinearUpdate(weights, point, settings.learningRate * point.label);
        changed = true;
      }
    }

    if (changed) updates += 1;
    if (kind === "averaged") {
      for (let index = 0; index < 3; index += 1) averagedWeights[index] += weights[index];
      averageCount += 1;
    }

    position += 1;
    if (position >= points.length) {
      const converged = (kind === "perceptron" || kind === "averaged") && epochErrors === 0;
      epoch += 1;
      position = 0;
      epochErrors = 0;
      done = converged || epoch >= settings.epochs;
    }
    return snapshot();
  }

  function snapshot() {
    return { score, epoch, position, updates, done, currentIndex, weights: [...deployedWeights()] };
  }
  return { step, snapshot, score };
}

function ensembleTrainer(points, settings, random) {
  const memberCount = settings.ensembleSize;
  const orders = makeOrders(points.length, memberCount, random);
  const totalWeights = [0, 0, 0];
  let memberWeights = [0, 0, 0];
  let member = 0;
  let position = 0;
  let updates = 0;
  let currentIndex = null;
  let done = points.length === 0;

  function combinedWeights() {
    if (done) return totalWeights;
    return totalWeights.map((value, index) => value + memberWeights[index]);
  }
  function score(point) { return dot(combinedWeights(), point); }
  function step() {
    if (done) return snapshot();
    currentIndex = orders[member][position];
    const point = points[currentIndex];
    if (point.label * dot(memberWeights, point) <= 0) {
      addLinearUpdate(memberWeights, point, settings.learningRate * point.label);
      updates += 1;
    }
    position += 1;
    if (position >= points.length) {
      for (let index = 0; index < 3; index += 1) totalWeights[index] += memberWeights[index];
      member += 1;
      position = 0;
      memberWeights = [0, 0, 0];
      done = member >= memberCount;
    }
    return snapshot();
  }
  function snapshot() {
    return { score, epoch: member, position, updates, done, currentIndex, weights: [...combinedWeights()] };
  }
  return { step, snapshot, score };
}

function kernelTrainer(kind, points, settings, random) {
  const coefficients = points.map(() => 0);
  const orders = makeOrders(points.length, settings.epochs, random);
  let bias = 0;
  let epoch = 0;
  let position = 0;
  let epochErrors = 0;
  let updates = 0;
  let currentIndex = null;
  let done = points.length === 0;

  function score(point) {
    let total = bias;
    for (let index = 0; index < points.length; index += 1) {
      if (coefficients[index] !== 0) total += coefficients[index] * rbf(points[index], point, settings.gamma);
    }
    return total;
  }

  function step() {
    if (done) return snapshot();
    currentIndex = orders[epoch][position];
    const point = points[currentIndex];
    const margin = point.label * score(point);
    if (kind === "kernel-svm") {
      const shrink = Math.max(0, 1 - settings.learningRate * settings.lambda);
      for (let index = 0; index < coefficients.length; index += 1) coefficients[index] *= shrink;
    }
    const active = kind === "kernel-perceptron" ? margin <= 0 : margin < 1;
    if (active) {
      coefficients[currentIndex] += settings.learningRate * point.label;
      bias += settings.learningRate * point.label;
      updates += 1;
      if (kind === "kernel-perceptron") epochErrors += 1;
    }
    position += 1;
    if (position >= points.length) {
      const converged = kind === "kernel-perceptron" && epochErrors === 0;
      epoch += 1;
      position = 0;
      epochErrors = 0;
      done = converged || epoch >= settings.epochs;
    }
    return snapshot();
  }
  function snapshot() {
    return { score, epoch, position, updates, done, currentIndex, supportCount: coefficients.filter((value) => Math.abs(value) > 1e-8).length };
  }
  return { step, snapshot, score };
}

function gaussianNBTrainer(points) {
  let fitted = false;
  let parameters = null;
  let currentIndex = null;

  function fit() {
    parameters = [BLUE, RED].map((label) => {
      const members = points.filter((point) => point.label === label);
      const count = members.length;
      if (count === 0) return { label, prior: 1e-12, mean: [0, 0], variance: [1, 1] };
      const mean = [
        members.reduce((sum, point) => sum + point.x, 0) / count,
        members.reduce((sum, point) => sum + point.y, 0) / count,
      ];
      const variance = [
        Math.max(0.0025, members.reduce((sum, point) => sum + (point.x - mean[0]) ** 2, 0) / count),
        Math.max(0.0025, members.reduce((sum, point) => sum + (point.y - mean[1]) ** 2, 0) / count),
      ];
      return { label, prior: count / points.length, mean, variance };
    });
    fitted = true;
  }

  function logJoint(point, model) {
    const values = [point.x, point.y];
    let result = Math.log(model.prior);
    for (let index = 0; index < 2; index += 1) {
      result -= 0.5 * Math.log(2 * Math.PI * model.variance[index]);
      result -= 0.5 * (values[index] - model.mean[index]) ** 2 / model.variance[index];
    }
    return result;
  }
  function score(point) {
    if (!fitted) return 0;
    return logJoint(point, parameters[1]) - logJoint(point, parameters[0]);
  }
  function step() {
    if (!fitted && points.length > 0) fit();
    return snapshot();
  }
  function snapshot() {
    return { score, epoch: fitted ? 1 : 0, position: 0, updates: 0, done: fitted || points.length === 0, currentIndex };
  }
  return { step, snapshot, score };
}

function knnTrainer(points, settings) {
  function score(point) {
    const candidates = points.filter((candidate) => candidate !== point);
    if (candidates.length === 0) return 0;
    const neighborCount = Math.min(candidates.length, Math.max(1, Math.round(settings.neighbors)));
    const nearest = candidates
      .map((candidate) => ({
        label: candidate.label,
        distance: (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2,
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, neighborCount);
    return nearest.reduce((sum, neighbor) => sum + neighbor.label, 0) / neighborCount;
  }
  function snapshot() {
    return { score, epoch: 0, position: 0, updates: 0, done: true, currentIndex: null };
  }
  return { step: snapshot, snapshot, score };
}

function neuralNetworkTrainer(points, settings, random) {
  const hiddenCount = Math.max(1, Math.round(settings.hiddenUnits));
  const hiddenWeights = Array.from({ length: hiddenCount }, () => [
    (random() * 2 - 1) * 0.35,
    (random() * 2 - 1) * 1.25,
    (random() * 2 - 1) * 1.25,
  ]);
  const outputWeights = Array.from({ length: hiddenCount }, () => (random() * 2 - 1) / Math.sqrt(hiddenCount));
  let outputBias = 0;
  const orders = makeOrders(points.length, settings.epochs, random);
  let epoch = 0;
  let position = 0;
  let updates = 0;
  let currentIndex = null;
  let done = points.length === 0;

  function sigmoid(value) {
    return value >= 0
      ? 1 / (1 + Math.exp(-value))
      : Math.exp(value) / (1 + Math.exp(value));
  }

  function activate(value) {
    if (settings.activation === "sigmoid") return sigmoid(value);
    if (settings.activation === "relu") return Math.max(0, value);
    return Math.tanh(value);
  }

  function activationDerivative(value, activated) {
    if (settings.activation === "sigmoid") return activated * (1 - activated);
    if (settings.activation === "relu") return value > 0 ? 1 : 0;
    return 1 - activated ** 2;
  }

  function hiddenState(point) {
    return hiddenWeights.map((weights) => {
      const value = weights[0] + weights[1] * point.x + weights[2] * point.y;
      return { value, activated: activate(value) };
    });
  }

  function score(point) {
    const hidden = hiddenState(point);
    return outputBias + hidden.reduce((sum, state, index) => sum + state.activated * outputWeights[index], 0);
  }

  function step() {
    if (done) return snapshot();
    currentIndex = orders[epoch][position];
    const point = points[currentIndex];
    const hidden = hiddenState(point);
    const rawScore = outputBias + hidden.reduce((sum, state, index) => sum + state.activated * outputWeights[index], 0);
    const target = point.label === RED ? 1 : 0;
    const outputGradient = sigmoid(rawScore) - target;
    const previousOutputWeights = [...outputWeights];

    outputBias -= settings.learningRate * outputGradient;
    for (let index = 0; index < hiddenCount; index += 1) {
      outputWeights[index] -= settings.learningRate * outputGradient * hidden[index].activated;
      const hiddenGradient = outputGradient
        * previousOutputWeights[index]
        * activationDerivative(hidden[index].value, hidden[index].activated);
      hiddenWeights[index][0] -= settings.learningRate * hiddenGradient;
      hiddenWeights[index][1] -= settings.learningRate * hiddenGradient * point.x;
      hiddenWeights[index][2] -= settings.learningRate * hiddenGradient * point.y;
    }
    updates += 1;
    position += 1;
    if (position >= points.length) {
      epoch += 1;
      position = 0;
      done = epoch >= settings.epochs;
    }
    return snapshot();
  }

  function snapshot() {
    return { score, epoch, position, updates, done, currentIndex, hiddenCount };
  }
  return { step, snapshot, score };
}

function createTrainer(kind, points, settings, seed = 2026) {
  const random = mulberry32(seed);
  if (kind === "ensemble") return ensembleTrainer(points, settings, random);
  if (kind === "gaussian-nb") return gaussianNBTrainer(points);
  if (kind === "knn") return knnTrainer(points, settings);
  if (kind === "neural-network") return neuralNetworkTrainer(points, settings, random);
  if (kind.startsWith("kernel-")) return kernelTrainer(kind, points, settings, random);
  return linearTrainer(kind, points, settings, random);
}

function accuracy(points, score) {
  if (points.length === 0) return 0;
  return points.filter((point) => predict(score(point)) === point.label).length / points.length;
}

if (typeof module !== "undefined") {
  module.exports = { RED, BLUE, DATASETS, mulberry32, shuffle, rbf, predict, createTrainer, accuracy };
}

if (typeof document !== "undefined") {
  const elements = {
    presets: document.querySelector("#presets"),
    datasetNote: document.querySelector("#dataset-note"),
    algorithm: document.querySelector("#algorithm"),
    algorithmNote: document.querySelector("#algorithm-note"),
    learningRate: document.querySelector("#learning-rate"),
    epochs: document.querySelector("#epochs"),
    lambda: document.querySelector("#lambda"),
    gamma: document.querySelector("#gamma"),
    ensembleSize: document.querySelector("#ensemble-size"),
    neighbors: document.querySelector("#neighbors"),
    hiddenUnits: document.querySelector("#hidden-units"),
    activation: document.querySelector("#activation"),
    speed: document.querySelector("#speed"),
    train: document.querySelector("#train"),
    step: document.querySelector("#step"),
    stop: document.querySelector("#stop"),
    reset: document.querySelector("#reset"),
    accuracy: document.querySelector("#accuracy"),
    accuracyLabel: document.querySelector("#accuracy-label"),
    updates: document.querySelector("#updates"),
    epoch: document.querySelector("#epoch"),
    example: document.querySelector("#example"),
    status: document.querySelector("#status"),
    plot: document.querySelector("#plot"),
    surface: document.querySelector("#surface"),
    surfaceExplanation: document.querySelector("#surface-explanation"),
    undo: document.querySelector("#undo"),
    clear: document.querySelector("#clear"),
  };

  let datasetKey = "clean";
  let points = DATASETS[datasetKey].make();
  let history = [];
  let addLabel = RED;
  let trainer;
  let running = false;
  let timer = null;

  function settings() {
    return {
      learningRate: Number(elements.learningRate.value),
      epochs: Number(elements.epochs.value),
      lambda: Number(elements.lambda.value),
      gamma: Number(elements.gamma.value),
      ensembleSize: Number(elements.ensembleSize.value),
      neighbors: Number(elements.neighbors.value),
      hiddenUnits: Number(elements.hiddenUnits.value),
      activation: elements.activation.value,
    };
  }

  function maxEpochLabel() {
    if (elements.algorithm.value === "gaussian-nb") return 1;
    if (elements.algorithm.value === "knn") return 0;
    return elements.algorithm.value === "ensemble" ? Number(elements.ensembleSize.value) : Number(elements.epochs.value);
  }

  function stopTraining(message = null) {
    running = false;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    elements.train.disabled = false;
    elements.step.disabled = false;
    elements.stop.disabled = true;
    if (message) elements.status.textContent = message;
  }

  function resetModel(message = "Weights reset. The untrained score is zero everywhere, so ties predict blue.") {
    stopTraining();
    trainer = createTrainer(elements.algorithm.value, points, settings());
    elements.status.classList.remove("warning");
    if (elements.algorithm.value === "knn") {
      elements.status.textContent = `kNN is ready: it stored ${points.length} examples and has no separate training step.`;
    } else if (elements.algorithm.value === "neural-network") {
      elements.status.textContent = `Network reinitialized with ${settings().hiddenUnits} random hidden projections. Train to refine its boundary.`;
    } else {
      elements.status.textContent = message;
    }
    updateView();
  }

  function currentState() { return trainer.snapshot(); }

  function tick(single = false) {
    const state = trainer.step();
    updateView();
    if (state.done) {
      const finalAccuracy = accuracy(points, state.score);
      const imperfect = finalAccuracy < 0.999;
      elements.status.classList.toggle("warning", imperfect);
      stopTraining(imperfect
        ? `Training stopped at ${(100 * finalAccuracy).toFixed(1)}% accuracy. This model or dataset may not permit a perfect boundary.`
        : "Training complete: every displayed training point is classified correctly.");
      return;
    }
    if (!single && running) {
      const delay = Math.round(650 * Math.pow(1 - Number(elements.speed.value) / 105, 2) + 12);
      timer = window.setTimeout(() => tick(false), delay);
    }
  }

  function train() {
    if (running || currentState().done) return;
    running = true;
    elements.train.disabled = true;
    elements.step.disabled = true;
    elements.stop.disabled = false;
    elements.status.classList.remove("warning");
    elements.status.textContent = "Training live: the outlined point is the current example.";
    tick(false);
  }

  function plotCoordinates(point, canvas) {
    const padding = 34;
    return {
      x: padding + (point.x + BOUNDS) / (2 * BOUNDS) * (canvas.width - 2 * padding),
      y: canvas.height - padding - (point.y + BOUNDS) / (2 * BOUNDS) * (canvas.height - 2 * padding),
    };
  }

  function dataCoordinates(event) {
    const rectangle = elements.plot.getBoundingClientRect();
    const canvasX = (event.clientX - rectangle.left) / rectangle.width * elements.plot.width;
    const canvasY = (event.clientY - rectangle.top) / rectangle.height * elements.plot.height;
    const padding = 34;
    return {
      x: ((canvasX - padding) / (elements.plot.width - 2 * padding)) * 2 * BOUNDS - BOUNDS,
      y: ((elements.plot.height - padding - canvasY) / (elements.plot.height - 2 * padding)) * 2 * BOUNDS - BOUNDS,
    };
  }

  function drawDecisionRegions(context, score) {
    const cells = 90;
    const padding = 34;
    const width = elements.plot.width - 2 * padding;
    const height = elements.plot.height - 2 * padding;
    const regionCanvas = document.createElement("canvas");
    regionCanvas.width = cells;
    regionCanvas.height = cells;
    const regionContext = regionCanvas.getContext("2d");
    const scores = Array.from({ length: cells + 1 }, () => Array(cells + 1));
    for (let row = 0; row <= cells; row += 1) {
      for (let column = 0; column <= cells; column += 1) {
        const point = {
          x: -BOUNDS + column / cells * 2 * BOUNDS,
          y: BOUNDS - row / cells * 2 * BOUNDS,
        };
        scores[row][column] = score(point);
      }
    }
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        const value = scores[row][column];
        const confidence = Math.min(1, Math.abs(value) / 2.5);
        if (value > 0) {
          regionContext.fillStyle = `rgb(${248 - confidence * 8}, ${241 - confidence * 22}, ${236 - confidence * 18})`;
        } else {
          regionContext.fillStyle = `rgb(${239 - confidence * 17}, ${246 - confidence * 17}, ${248 - confidence * 9})`;
        }
        regionContext.fillRect(column, row, 1, 1);
      }
    }
    context.imageSmoothingEnabled = true;
    context.drawImage(regionCanvas, padding, padding, width, height);
    const cellWidth = width / cells;
    const cellHeight = height / cells;
    const interpolate = (first, second) => {
      const denominator = first - second;
      if (Math.abs(denominator) < 1e-12) return 0.5;
      return Math.max(0, Math.min(1, first / denominator));
    };
    const boundarySegments = [];
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        const topLeft = scores[row][column];
        const topRight = scores[row][column + 1];
        const bottomRight = scores[row + 1][column + 1];
        const bottomLeft = scores[row + 1][column];
        const crossings = [];
        if ((topLeft > 0) !== (topRight > 0)) {
          crossings.push({ edge: "top", x: column + interpolate(topLeft, topRight), y: row });
        }
        if ((topRight > 0) !== (bottomRight > 0)) {
          crossings.push({ edge: "right", x: column + 1, y: row + interpolate(topRight, bottomRight) });
        }
        if ((bottomLeft > 0) !== (bottomRight > 0)) {
          crossings.push({ edge: "bottom", x: column + interpolate(bottomLeft, bottomRight), y: row + 1 });
        }
        if ((topLeft > 0) !== (bottomLeft > 0)) {
          crossings.push({ edge: "left", x: column, y: row + interpolate(topLeft, bottomLeft) });
        }
        if (crossings.length === 2) {
          boundarySegments.push([crossings[0], crossings[1]]);
        } else if (crossings.length === 4) {
          const centerPositive = (topLeft + topRight + bottomRight + bottomLeft) / 4 > 0;
          const topPositive = topLeft > 0;
          const byEdge = Object.fromEntries(crossings.map((crossing) => [crossing.edge, crossing]));
          if (centerPositive === topPositive) {
            boundarySegments.push([byEdge.top, byEdge.right], [byEdge.bottom, byEdge.left]);
          } else {
            boundarySegments.push([byEdge.top, byEdge.left], [byEdge.right, byEdge.bottom]);
          }
        }
      }
    }
    context.strokeStyle = "rgba(32, 32, 30, 0.84)";
    context.lineWidth = 2.25;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    boundarySegments.forEach(([start, end]) => {
      context.moveTo(padding + start.x * cellWidth, padding + start.y * cellHeight);
      context.lineTo(padding + end.x * cellWidth, padding + end.y * cellHeight);
    });
    context.stroke();
  }

  function updateControlVisibility() {
    const kind = elements.algorithm.value;
    const visibleControls = new Set(ALGORITHM_CONTROLS[kind]);
    document.querySelectorAll("[data-control]").forEach((control) => {
      control.hidden = !visibleControls.has(control.dataset.control);
    });
    const instantFit = kind === "gaussian-nb";
    const noFit = kind === "knn";
    elements.train.textContent = instantFit ? "Fit model" : "Train";
    elements.train.hidden = noFit;
    elements.step.hidden = instantFit || noFit;
    elements.stop.hidden = instantFit || noFit;
    elements.reset.hidden = noFit;
  }

  function drawPlot() {
    const context = elements.plot.getContext("2d");
    context.clearRect(0, 0, elements.plot.width, elements.plot.height);
    context.fillStyle = "#fffefa";
    context.fillRect(0, 0, elements.plot.width, elements.plot.height);
    const state = currentState();
    drawDecisionRegions(context, state.score);

    const origin = plotCoordinates({ x: 0, y: 0 }, elements.plot);
    context.strokeStyle = "rgba(104, 102, 95, 0.28)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(34, origin.y); context.lineTo(elements.plot.width - 34, origin.y);
    context.moveTo(origin.x, 34); context.lineTo(origin.x, elements.plot.height - 34);
    context.stroke();

    points.forEach((point, index) => {
      const location = plotCoordinates(point, elements.plot);
      context.beginPath();
      context.arc(location.x, location.y, index === state.currentIndex ? 7.5 : 5.4, 0, Math.PI * 2);
      context.fillStyle = point.label === RED ? "#a43d35" : "#315f78";
      context.fill();
      context.strokeStyle = index === state.currentIndex ? "#20201e" : "rgba(255,255,255,0.9)";
      context.lineWidth = index === state.currentIndex ? 3 : 1.2;
      context.stroke();
    });
  }

  function project3d(x, y, z, yaw, centerX, centerY, scale) {
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    const rotatedX = x * cosine - y * sine;
    const rotatedY = x * sine + y * cosine;
    return { x: centerX + rotatedX * scale, y: centerY + rotatedY * scale * 0.42 - z * scale * 0.72 };
  }

  function drawSurface() {
    const canvas = elements.surface;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fffefa";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const score = currentState().score;
    const size = 20;
    const raw = [];
    let maxAbs = 0.25;
    for (let row = 0; row <= size; row += 1) {
      raw[row] = [];
      for (let column = 0; column <= size; column += 1) {
        const x = -BOUNDS + column / size * 2 * BOUNDS;
        const y = -BOUNDS + row / size * 2 * BOUNDS;
        const value = score({ x, y });
        raw[row][column] = { x, y, value };
        maxAbs = Math.max(maxAbs, Math.abs(value));
      }
    }
    const yaw = -0.74;
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.62;
    const scale = Math.min(canvas.width / 3.25, canvas.height / 2.45);
    const normalize = (value) => Math.max(-1.25, Math.min(1.25, value / maxAbs));
    const project = (point, z = normalize(point.value)) => project3d(point.x, point.y, z, yaw, centerX, centerY, scale);

    const zeroCorners = [
      project3d(-BOUNDS, -BOUNDS, 0, yaw, centerX, centerY, scale),
      project3d(BOUNDS, -BOUNDS, 0, yaw, centerX, centerY, scale),
      project3d(BOUNDS, BOUNDS, 0, yaw, centerX, centerY, scale),
      project3d(-BOUNDS, BOUNDS, 0, yaw, centerX, centerY, scale),
    ];
    context.beginPath();
    zeroCorners.forEach((corner, index) => index === 0 ? context.moveTo(corner.x, corner.y) : context.lineTo(corner.x, corner.y));
    context.closePath();
    context.fillStyle = "rgba(170, 122, 37, 0.10)";
    context.fill();
    context.strokeStyle = "rgba(170, 122, 37, 0.42)";
    context.stroke();

    for (let row = size - 1; row >= 0; row -= 1) {
      for (let column = 0; column < size; column += 1) {
        const corners = [raw[row][column], raw[row][column + 1], raw[row + 1][column + 1], raw[row + 1][column]];
        const projected = corners.map((corner) => project(corner));
        const average = corners.reduce((sum, corner) => sum + corner.value, 0) / 4;
        context.beginPath();
        projected.forEach((corner, index) => index === 0 ? context.moveTo(corner.x, corner.y) : context.lineTo(corner.x, corner.y));
        context.closePath();
        context.fillStyle = average > 0 ? "rgba(164, 61, 53, 0.36)" : "rgba(49, 95, 120, 0.36)";
        context.fill();
        context.strokeStyle = "rgba(75, 70, 63, 0.16)";
        context.lineWidth = 0.6;
        context.stroke();
      }
    }

    points.forEach((point) => {
      const value = score(point);
      const location = project({ ...point, value });
      context.beginPath();
      context.arc(location.x, location.y, 3.4, 0, 2 * Math.PI);
      context.fillStyle = point.label === RED ? "#a43d35" : "#315f78";
      context.fill();
      context.strokeStyle = "white";
      context.lineWidth = 0.8;
      context.stroke();
    });
    context.fillStyle = "#68665f";
    context.font = "13px Georgia";
    context.fillText("score +", 18, 28);
    context.fillText("score −", 18, canvas.height - 18);
  }

  function updateView() {
    const state = currentState();
    elements.accuracy.textContent = `${(accuracy(points, state.score) * 100).toFixed(1)}%`;
    elements.accuracyLabel.textContent = elements.algorithm.value === "knn" ? "leave-one-out accuracy" : "accuracy";
    elements.updates.textContent = String(state.updates);
    elements.epoch.textContent = `${Math.min(state.epoch + (state.done ? 0 : 1), maxEpochLabel())} / ${maxEpochLabel()}`;
    if (elements.algorithm.value === "knn") elements.epoch.textContent = "n/a";
    elements.example.textContent = state.currentIndex === null ? "—" : `${state.currentIndex + 1} / ${points.length}`;
    drawPlot();
    drawSurface();
  }

  function chooseDataset(key) {
    datasetKey = key;
    points = DATASETS[key].make();
    history = [];
    document.querySelectorAll("[data-dataset]").forEach((button) => button.classList.toggle("active", button.dataset.dataset === key));
    elements.datasetNote.textContent = DATASETS[key].note;
    resetModel(`Loaded “${DATASETS[key].label}” with ${points.length} examples.`);
  }

  Object.entries(DATASETS).forEach(([key, dataset]) => {
    const button = document.createElement("button");
    button.textContent = dataset.label;
    button.dataset.dataset = key;
    button.addEventListener("click", () => chooseDataset(key));
    elements.presets.append(button);
  });

  elements.algorithm.addEventListener("change", () => {
    elements.algorithmNote.textContent = ALGORITHM_INFO[elements.algorithm.value];
    const nonlinear = elements.algorithm.value.startsWith("kernel-")
      || elements.algorithm.value === "gaussian-nb"
      || elements.algorithm.value === "knn"
      || elements.algorithm.value === "neural-network";
    elements.surfaceExplanation.textContent = nonlinear
      ? elements.algorithm.value === "knn"
        ? "kNN produces a terraced vote surface rather than a plane. Its jumps show where the neighborhood's majority label changes."
        : "This model's score surface can curve. The contour where it crosses score zero becomes the nonlinear boundary in the two-dimensional view."
      : "For a linear classifier, the score surface is a plane. Its intersection with score zero is the straight decision boundary shown above.";
    updateControlVisibility();
    resetModel();
  });
  [elements.learningRate, elements.epochs, elements.lambda, elements.gamma, elements.ensembleSize, elements.neighbors, elements.hiddenUnits, elements.activation].forEach((control) => {
    control.addEventListener("change", () => resetModel("A training setting changed, so the model was reset."));
  });
  elements.train.addEventListener("click", train);
  elements.step.addEventListener("click", () => tick(true));
  elements.stop.addEventListener("click", () => stopTraining("Training paused. Continue one example at a time or resume live training."));
  elements.reset.addEventListener("click", () => resetModel());

  document.querySelectorAll("[data-add-label]").forEach((button) => {
    button.addEventListener("click", () => {
      addLabel = Number(button.dataset.addLabel);
      document.querySelectorAll("[data-add-label]").forEach((other) => other.classList.toggle("active", other === button));
    });
  });
  elements.plot.addEventListener("pointerdown", (event) => {
    const point = dataCoordinates(event);
    if (Math.abs(point.x) > BOUNDS || Math.abs(point.y) > BOUNDS) return;
    history.push(points.map((item) => ({ ...item })));
    points.push({ ...point, label: addLabel });
    elements.datasetNote.textContent = "Custom dataset: click to add more points, or select a preset to start over.";
    resetModel("Point added. The model was reset because its training data changed.");
  });
  elements.undo.addEventListener("click", () => {
    if (history.length > 0) points = history.pop();
    else if (points.length > 0) points.pop();
    resetModel("Last edit undone; model reset.");
  });
  elements.clear.addEventListener("click", () => {
    history.push(points.map((item) => ({ ...item })));
    points = [];
    elements.datasetNote.textContent = "Empty custom dataset: choose a class and click the plot to add examples.";
    resetModel("Dataset cleared.");
  });

  elements.algorithmNote.textContent = ALGORITHM_INFO[elements.algorithm.value];
  updateControlVisibility();
  chooseDataset(datasetKey);
}
