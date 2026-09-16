"use strict";

const FEATURES = ["bias", "walks", "quacks", "has feathers", "honks"];
const CLASSES = ["duck", "goose"];
const EXAMPLES = [
  { name: "Duck", gold: "duck", features: [1, 1, 1, 1, 0] },
  { name: "Goose", gold: "goose", features: [1, 1, 0, 1, 1] },
];
const TIE_WINNER = "goose";

function zeroWeights() {
  return Object.fromEntries(CLASSES.map((className) => [className, FEATURES.map(() => 0)]));
}

function cloneWeights(weights) {
  return Object.fromEntries(CLASSES.map((className) => [className, [...weights[className]]]));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function scoreExample(example, weights) {
  return Object.fromEntries(CLASSES.map((className) => [className, dot(example.features, weights[className])]));
}

function predict(scores) {
  if (scores.duck === scores.goose) return TIE_WINNER;
  return scores.duck > scores.goose ? "duck" : "goose";
}

function addScaled(weights, features, scale) {
  return weights.map((weight, index) => weight + scale * features[index]);
}

function trainPerceptron(maxEpochs = 10) {
  let weights = zeroWeights();
  const events = [];
  const epochs = [];

  for (let epoch = 1; epoch <= maxEpochs; epoch += 1) {
    let errors = 0;
    const eventStart = events.length;
    for (let exampleIndex = 0; exampleIndex < EXAMPLES.length; exampleIndex += 1) {
      const example = EXAMPLES[exampleIndex];
      const before = cloneWeights(weights);
      const scores = scoreExample(example, before);
      const predicted = predict(scores);
      const mistake = predicted !== example.gold;
      if (mistake) {
        weights[example.gold] = addScaled(weights[example.gold], example.features, 1);
        weights[predicted] = addScaled(weights[predicted], example.features, -1);
        errors += 1;
      }
      events.push({
        step: events.length + 1,
        epoch,
        exampleIndex,
        example,
        before,
        scores,
        predicted,
        mistake,
        after: cloneWeights(weights),
      });
    }
    epochs.push({ epoch, errors, eventStart, eventEnd: events.length - 1 });
    if (errors === 0) break;
  }

  return { initialWeights: zeroWeights(), events, epochs, finalWeights: cloneWeights(weights) };
}

const TRAINING = trainPerceptron();

function vectorEqual(left, right) {
  return left.every((value, index) => value === right[index]);
}

function vectorText(vector) {
  return `[${vector.join(", ")}]`;
}

function classLabel(className) {
  return className[0].toUpperCase() + className.slice(1);
}

function vectorGrid(rows, beforeWeights = null) {
  const header = ["vector", ...FEATURES]
    .map((value) => `<div class="vector-cell heading">${value}</div>`)
    .join("");
  const body = rows.map((row) => {
    const values = row.values.map((value, index) => {
      const classes = ["vector-cell"];
      if (row.kind) classes.push(row.kind);
      if (beforeWeights && row.className && value !== beforeWeights[row.className][index]) classes.push("changed");
      return `<div class="${classes.join(" ")}">${value > 0 && row.showPlus ? "+" : ""}${value}</div>`;
    }).join("");
    return `<div class="vector-cell row-label">${row.label}</div>${values}`;
  }).join("");
  return `<div class="vector-wrap"><div class="vector-grid">${header}${body}</div></div>`;
}

function renderExamples(activeIndex = null) {
  return EXAMPLES.map((example, index) => `
    <article class="example-card ${example.gold} ${index === activeIndex ? "current" : ""}">
      <span class="class-label">Gold label: ${example.gold}</span>
      <h3>${example.name} feature vector ${vectorText(example.features)}</h3>
      <div class="feature-chips">
        ${FEATURES.map((feature, featureIndex) => `<span class="feature-chip ${example.features[featureIndex] ? "on" : ""}">${feature}: ${example.features[featureIndex]}</span>`).join("")}
      </div>
    </article>`).join("");
}

function scoreFormula(example, weights, className) {
  const terms = example.features.map((feature, index) => `${feature}×${weights[className][index]}`);
  return `${terms.join(" + ")} = ${dot(example.features, weights[className])}`;
}

function renderScores(event) {
  return `
    <div class="score-grid">
      ${CLASSES.map((className) => `
        <article class="score-card ${className}">
          <span class="class-label">${classLabel(className)} score</span>
          <div class="formula">${scoreFormula(event.example, event.before, className)}</div>
          <p class="score-value">${event.scores[className]}</p>
        </article>`).join("")}
    </div>`;
}

function renderInitialStage() {
  return `
    <div class="stage-heading">
      <div class="stage-badge">0</div>
      <div><h2>Initialize every weight to zero</h2><p>There is one five-position weight vector for each class.</p></div>
    </div>
    <p class="mobile-hint">Swipe vectors sideways to see every feature.</p>
    ${vectorGrid(CLASSES.map((className) => ({ label: `w ${className}`, values: TRAINING.initialWeights[className] })))}
    <div class="prediction"><strong>What happens next?</strong> The duck receives score 0 from both classes. The fixed tie rule predicts goose, producing the first mistake and update.</div>`;
}

function updateRows(event) {
  const goldDelta = event.example.features;
  const predictedDelta = event.example.features.map((value) => -value);
  return [
    { label: `old w ${event.example.gold}`, values: event.before[event.example.gold] },
    { label: `+ f(${event.example.name.toLowerCase()})`, values: goldDelta, kind: "delta-plus", showPlus: true },
    { label: `new w ${event.example.gold}`, values: event.after[event.example.gold], className: event.example.gold },
    { label: `old w ${event.predicted}`, values: event.before[event.predicted] },
    { label: `− f(${event.example.name.toLowerCase()})`, values: predictedDelta, kind: "delta-minus" },
    { label: `new w ${event.predicted}`, values: event.after[event.predicted], className: event.predicted },
  ];
}

function renderEventStage(event) {
  const tied = event.scores.duck === event.scores.goose;
  const outcomeClass = event.mistake ? "mistake" : "correct";
  const outcomeText = event.mistake
    ? `Mistake: predicted ${event.predicted}, but the gold label is ${event.example.gold}.`
    : `Correct: predicted ${event.predicted}. No weights change.`;
  const update = event.mistake
    ? `
      <div class="update-rule">
        <strong>Reward gold, penalize the incorrect prediction:</strong><br>
        w<sub>${event.example.gold}</sub> ← w<sub>${event.example.gold}</sub> + f(${event.example.name.toLowerCase()})<br>
        w<sub>${event.predicted}</sub> ← w<sub>${event.predicted}</sub> − f(${event.example.name.toLowerCase()})
      </div>
      <div class="weights-title"><h3>Apply the update component by component</h3><p>Gold gets +f(x); prediction gets −f(x).</p></div>
      <p class="mobile-hint">Swipe vectors sideways to see every feature.</p>
      ${vectorGrid(updateRows(event), event.before)}`
    : `
      <div class="weights-title"><h3>Weights remain unchanged</h3><p>The perceptron is mistake-driven.</p></div>
      <p class="mobile-hint">Swipe vectors sideways to see every feature.</p>
      ${vectorGrid(CLASSES.map((className) => ({ label: `w ${className}`, values: event.after[className] })))}`;

  return `
    <div class="stage-heading">
      <div class="stage-badge">${event.step}</div>
      <div><h2>Epoch ${event.epoch}: classify the ${event.example.name.toLowerCase()}</h2><p>Use the weights as they stand before this example.</p></div>
    </div>
    ${renderScores(event)}
    <div class="prediction ${outcomeClass}">
      ${tied ? `<strong>Tie at ${event.scores.duck}:</strong> the fixed rule chooses goose. ` : ""}<strong>${outcomeText}</strong>
    </div>
    ${update}
    ${event.step === TRAINING.events.length ? renderConvergence() : ""}`;
}

function renderConvergence() {
  const evaluations = EXAMPLES.map((example) => {
    const scores = scoreExample(example, TRAINING.finalWeights);
    const predicted = predict(scores);
    return `<tr><th scope="row">${example.name}</th><td>${scores.duck}</td><td>${scores.goose}</td><td>${predicted}</td><td class="check">✓</td></tr>`;
  }).join("");
  return `
    <div class="converged">
      <h3>Converged after epoch 2</h3>
      <p>Epoch 2 contains zero errors, so training stops. Shared features have canceled; quacking favors duck and honking favors goose.</p>
      <table class="evaluation-table">
        <thead><tr><th>Example</th><th>Duck score</th><th>Goose score</th><th>Prediction</th><th>Correct</th></tr></thead>
        <tbody>${evaluations}</tbody>
      </table>
    </div>`;
}

function renderEpochs(currentStep) {
  return TRAINING.epochs.map((epoch) => {
    const active = currentStep > 0 && TRAINING.events[currentStep - 1].epoch === epoch.epoch;
    const complete = currentStep - 1 >= epoch.eventEnd;
    const visibleErrors = complete ? epoch.errors : "—";
    return `
      <article class="epoch-card ${active ? "active" : ""}">
        <span class="class-label">Epoch ${epoch.epoch}</span>
        <div class="epoch-errors">${visibleErrors}</div>
        <p>${complete ? `${epoch.errors} mistake${epoch.errors === 1 ? "" : "s"}` : "not complete"}</p>
      </article>`;
  }).join("");
}

if (typeof module !== "undefined") {
  module.exports = {
    FEATURES,
    CLASSES,
    EXAMPLES,
    TIE_WINNER,
    dot,
    scoreExample,
    predict,
    addScaled,
    trainPerceptron,
  };
}

if (typeof document !== "undefined") {
  const elements = {
    examples: document.querySelector("#examples"),
    previous: document.querySelector("#previous"),
    play: document.querySelector("#play"),
    next: document.querySelector("#next"),
    step: document.querySelector("#step"),
    timeline: document.querySelector("#timeline"),
    status: document.querySelector("#status"),
    stage: document.querySelector("#stage"),
    epochs: document.querySelector("#epochs"),
  };
  let currentStep = 0;
  let timer = null;

  function stopPlaying() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function stepLabel(step) {
    if (step === 0) return { top: "Start", bottom: "zero weights" };
    const event = TRAINING.events[step - 1];
    return {
      top: `Epoch ${event.epoch} · ${event.example.name}`,
      bottom: event.mistake ? "update" : "correct",
    };
  }

  function renderTimeline() {
    elements.timeline.replaceChildren();
    for (let step = 0; step <= TRAINING.events.length; step += 1) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const label = stepLabel(step);
      button.type = "button";
      button.classList.toggle("active", step === currentStep);
      button.classList.toggle("done", step < currentStep);
      button.innerHTML = `<span class="timeline-label">${label.top}</span><span class="timeline-result">${label.bottom}</span>`;
      button.addEventListener("click", () => setStep(step));
      item.append(button);
      elements.timeline.append(item);
    }
  }

  function renderStatus() {
    if (currentStep === 0) {
      elements.status.innerHTML = "Both class weight vectors begin at zero. The first score will be a tie, resolved as <strong>goose</strong>.";
    } else {
      const event = TRAINING.events[currentStep - 1];
      elements.status.innerHTML = `Epoch ${event.epoch}, ${event.example.name.toLowerCase()}: predicted <strong>${event.predicted}</strong>; ${event.mistake ? "update the weights" : "correct, so do not update"}.`;
    }
  }

  function render() {
    const activeIndex = currentStep === 0 ? null : TRAINING.events[currentStep - 1].exampleIndex;
    elements.examples.innerHTML = renderExamples(activeIndex);
    elements.stage.innerHTML = currentStep === 0
      ? renderInitialStage()
      : renderEventStage(TRAINING.events[currentStep - 1]);
    elements.epochs.innerHTML = renderEpochs(currentStep);
    elements.step.value = currentStep;
    elements.previous.disabled = currentStep === 0;
    elements.next.disabled = currentStep === TRAINING.events.length;
    elements.play.textContent = currentStep === TRAINING.events.length ? "Replay training" : "Play training";
    renderTimeline();
    renderStatus();
  }

  function setStep(step) {
    currentStep = Math.max(0, Math.min(TRAINING.events.length, Number(step)));
    if (currentStep === TRAINING.events.length) stopPlaying();
    render();
  }

  elements.previous.addEventListener("click", () => {
    stopPlaying();
    setStep(currentStep - 1);
  });
  elements.next.addEventListener("click", () => {
    stopPlaying();
    setStep(currentStep + 1);
  });
  elements.step.addEventListener("input", (event) => {
    stopPlaying();
    setStep(event.target.value);
  });
  elements.play.addEventListener("click", () => {
    if (timer !== null) {
      stopPlaying();
      render();
      return;
    }
    if (currentStep === TRAINING.events.length) {
      currentStep = 0;
      render();
    }
    elements.play.textContent = "Pause";
    timer = window.setInterval(() => setStep(currentStep + 1), 1050);
  });

  render();
}
