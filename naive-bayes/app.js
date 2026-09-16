"use strict";

const TRAINING_CORPUS = [
  { className: "positive", text: "this is good" },
  { className: "positive", text: "this could be great" },
  { className: "negative", text: "this is not good" },
];

const CLASSES = ["positive", "negative"];
const VOCABULARY = ["be", "could", "good", "great", "is", "not", "this"];
const FEATURES = ["bias", ...VOCABULARY];
const DEFAULT_SENTENCE = "this is not great";

const STAGES = [
  { name: "Corpus", title: "Start with labeled reviews" },
  { name: "Counts", title: "Turn the corpus into counts" },
  { name: "Smooth", title: "Add one to every vocabulary count" },
  { name: "Multiply", title: "Classify by multiplying probabilities" },
  { name: "Log weights", title: "Convert probabilities into weights" },
  { name: "Vectorize", title: "Represent the sentence as features" },
  { name: "Dot product", title: "Multiply corresponding positions and add" },
  { name: "Bayes", title: "Normalize the scores with Bayes' Rule" },
];

function tokenize(text) {
  return text.toLocaleLowerCase().normalize("NFC").match(/\p{L}+/gu) || [];
}

function deriveVocabulary(corpus) {
  return [...new Set(corpus.flatMap((document) => tokenize(document.text)))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function corpusFromText(positiveText, negativeText) {
  return CLASSES.flatMap((className) => {
    const text = className === "positive" ? positiveText : negativeText;
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ className, text: line }));
  });
}

function trainModel(corpus = TRAINING_CORPUS, vocabulary = null) {
  const resolvedVocabulary = vocabulary ? [...vocabulary] : deriveVocabulary(corpus);
  if (resolvedVocabulary.length === 0) throw new Error("The training corpus needs at least one word.");
  for (const className of CLASSES) {
    if (!corpus.some((document) => document.className === className)) {
      throw new Error(`Add at least one ${className} training example.`);
    }
  }

  const model = {
    corpus: corpus.map((document) => ({ ...document })),
    vocabulary: resolvedVocabulary,
    documentTotal: corpus.length,
    classes: {},
  };
  for (const className of CLASSES) {
    const documents = corpus.filter((document) => document.className === className);
    const counts = Object.fromEntries(resolvedVocabulary.map((word) => [word, 0]));
    for (const document of documents) {
      for (const word of tokenize(document.text)) {
        if (word in counts) counts[word] += 1;
      }
    }
    const tokenTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const denominator = tokenTotal + resolvedVocabulary.length;
    const smoothedCounts = Object.fromEntries(resolvedVocabulary.map((word) => [word, counts[word] + 1]));
    const probabilities = Object.fromEntries(resolvedVocabulary.map((word) => [word, smoothedCounts[word] / denominator]));
    const prior = documents.length / corpus.length;
    model.classes[className] = {
      documentCount: documents.length,
      counts,
      tokenTotal,
      denominator,
      smoothedCounts,
      probabilities,
      prior,
      weights: [Math.log(prior), ...resolvedVocabulary.map((word) => Math.log(probabilities[word]))],
    };
  }
  return model;
}

function classify(text, model = trainModel()) {
  const tokens = tokenize(text);
  const knownTokens = tokens.filter((word) => model.vocabulary.includes(word));
  const unknownTokens = tokens.filter((word) => !model.vocabulary.includes(word));
  const counts = Object.fromEntries(model.vocabulary.map((word) => [word, 0]));
  for (const word of knownTokens) counts[word] += 1;
  const features = [1, ...model.vocabulary.map((word) => counts[word])];
  const results = {};

  for (const className of CLASSES) {
    const classModel = model.classes[className];
    const contributions = features.map((value, index) => value * classModel.weights[index]);
    const logScore = contributions.reduce((sum, value) => sum + value, 0);
    const likelihood = knownTokens.reduce(
      (score, word) => score * classModel.probabilities[word],
      1
    );
    const productScore = classModel.prior * likelihood;
    results[className] = {
      features,
      contributions,
      logScore,
      likelihood,
      productScore,
      recoveredScore: Math.exp(logScore),
    };
  }

  const scoreTotal = CLASSES.reduce((sum, className) => sum + results[className].productScore, 0);
  for (const className of CLASSES) {
    results[className].posterior = results[className].productScore / scoreTotal;
  }

  const prediction = CLASSES.reduce((best, className) =>
    results[className].logScore > results[best].logScore ? className : best
  );

  return { tokens, knownTokens, unknownTokens, counts, features, results, prediction };
}

let MODEL = trainModel();

function modelFeatures(model = MODEL) {
  return ["bias", ...model.vocabulary];
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fraction(numerator, denominator) {
  return `<span class="fraction"><span>${numerator}</span><span>${denominator}</span></span>`;
}

function formatLog(value) {
  return value.toFixed(3).replace("-0.000", "0.000");
}

function formatScore(value) {
  return value < 0.001 ? value.toFixed(7) : value.toFixed(5);
}

function classLabel(className) {
  return className[0].toUpperCase() + className.slice(1);
}

function stageHeading(index, intro) {
  return `
    <div class="stage-heading">
      <div class="stage-badge">${index + 1}</div>
      <div>
        <h2>${STAGES[index].title}</h2>
        <p class="stage-intro">${intro}</p>
      </div>
    </div>`;
}

function renderCorpusStage() {
  const reviews = MODEL.corpus.map((document) => `
    <article class="review-card ${document.className}">
      <span class="review-class">${document.className}</span>
      <div class="tokens">${tokenize(document.text).map((word) => `<span class="token">${word}</span>`).join("")}</div>
    </article>`).join("");
  return `
    ${stageHeading(0, "The labels tell us which class-specific bag of words receives each review. They also determine the class priors before we inspect a new sentence.")}
    <div class="corpus-grid">${reviews}</div>
    <div class="prior-strip">
      <strong>Class priors from document counts</strong>
      <div class="prior-value positive-text">p(positive) = ${fraction(MODEL.classes.positive.documentCount, MODEL.documentTotal)}</div>
      <div class="prior-value negative-text">p(negative) = ${fraction(MODEL.classes.negative.documentCount, MODEL.documentTotal)}</div>
    </div>`;
}

function renderCountsStage() {
  const rows = MODEL.vocabulary.map((word) => `
    <tr><th scope="row">${word}</th><td>${MODEL.classes.positive.counts[word]}</td><td>${MODEL.classes.negative.counts[word]}</td></tr>`).join("");
  return `
    ${stageHeading(1, `Lowercase and tokenize each review, collect the ${MODEL.vocabulary.length} distinct word types into a vocabulary, and count how often each word occurs inside each class.`)}
    <p class="vocabulary"><strong>Vocabulary:</strong> [${MODEL.vocabulary.join(", ")}]</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Word</th><th class="positive-text">Positive count</th><th class="negative-text">Negative count</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>Total tokens</th><td>${MODEL.classes.positive.tokenTotal}</td><td>${MODEL.classes.negative.tokenTotal}</td></tr></tfoot>
      </table>
    </div>`;
}

function smoothCell(raw) {
  return `<span class="count-change"><span>${raw}</span><span class="plus-one">+ 1</span><span class="smoothed-count">= ${raw + 1}</span></span>`;
}

function renderSmoothingStage() {
  const vocabularySize = MODEL.vocabulary.length;
  const rows = MODEL.vocabulary.map((word) => `
    <tr>
      <th scope="row">${word}</th>
      <td>${smoothCell(MODEL.classes.positive.counts[word])}</td>
      <td>${fraction(MODEL.classes.positive.smoothedCounts[word], MODEL.classes.positive.denominator)}</td>
      <td>${smoothCell(MODEL.classes.negative.counts[word])}</td>
      <td>${fraction(MODEL.classes.negative.smoothedCounts[word], MODEL.classes.negative.denominator)}</td>
    </tr>`).join("");
  return `
    ${stageHeading(2, `Add one pseudocount to every vocabulary item in each class. Because the vocabulary contains ${vocabularySize} words, each denominator grows by ${vocabularySize}—not merely by the number of unseen words.`)}
    <div class="class-grid">
      <div class="class-card positive"><span class="class-label">Positive denominator</span><div class="denominator">${MODEL.classes.positive.tokenTotal} + ${vocabularySize} = ${MODEL.classes.positive.denominator}</div><p class="muted">${MODEL.classes.positive.tokenTotal} observed tokens + one pseudocount for each of ${vocabularySize} words</p></div>
      <div class="class-card negative"><span class="class-label">Negative denominator</span><div class="denominator">${MODEL.classes.negative.tokenTotal} + ${vocabularySize} = ${MODEL.classes.negative.denominator}</div><p class="muted">${MODEL.classes.negative.tokenTotal} observed tokens + one pseudocount for each of ${vocabularySize} words</p></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th rowspan="2">Word</th><th colspan="2" class="positive-text">Positive</th><th colspan="2" class="negative-text">Negative</th></tr><tr><th>Smoothed count</th><th>Probability</th><th>Smoothed count</th><th>Probability</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function probabilityFactor(word, className) {
  const classModel = MODEL.classes[className];
  return `<span class="factor"><span class="factor-label">${escapeHTML(word)}</span>${fraction(classModel.smoothedCounts[word], classModel.denominator)}</span>`;
}

function renderProductCard(className, analysis) {
  const classModel = MODEL.classes[className];
  const priorFraction = fraction(classModel.documentCount, MODEL.documentTotal);
  const factors = [
    `<span class="factor"><span class="factor-label">prior</span>${priorFraction}</span>`,
    ...analysis.knownTokens.map((word) => probabilityFactor(word, className)),
  ];
  return `
    <article class="score-card ${className}">
      <span class="class-label">${classLabel(className)} class</span>
      <div class="formula-line">${factors.join('<span class="operator">×</span>')}<span class="operator">=</span></div>
      <div class="score-number">${formatScore(analysis.results[className].productScore)}</div>
    </article>`;
}

function renderMultiplyStage(analysis) {
  const defaultExample = isDefaultSentence(analysis.tokens);
  return `
    ${stageHeading(3, "For each class, begin with its prior and multiply by that class's smoothed probability for every known word in the sentence. The denominator p(d) is unnecessary when we only compare classes.")}
    <div class="score-grid">${CLASSES.map((className) => renderProductCard(className, analysis)).join("")}</div>
    <p class="winner"><strong>Prediction: ${classLabel(analysis.prediction)}.</strong> Its unnormalized score is larger.${defaultExample ? " For the default sentence, the model narrowly predicts positive even though the phrase <em>not great</em> sounds negative; the bag-of-words model cannot represent that phrase as a unit." : ""}</p>`;
}

function isDefaultSentence(tokens) {
  return tokens.join(" ") === DEFAULT_SENTENCE;
}

function probabilityDescription(feature, className) {
  const classModel = MODEL.classes[className];
  if (feature === "bias") return { numerator: classModel.documentCount, denominator: MODEL.documentTotal };
  return { numerator: classModel.smoothedCounts[feature], denominator: classModel.denominator };
}

function renderLogStage() {
  const features = modelFeatures();
  const rows = features.map((feature, index) => {
    const positive = probabilityDescription(feature, "positive");
    const negative = probabilityDescription(feature, "negative");
    return `
      <tr>
        <th scope="row">${feature}</th>
        <td>${fraction(positive.numerator, positive.denominator)}</td><td>${formatLog(MODEL.classes.positive.weights[index])}</td>
        <td>${fraction(negative.numerator, negative.denominator)}</td><td>${formatLog(MODEL.classes.negative.weights[index])}</td>
      </tr>`;
  }).join("");
  return `
    ${stageHeading(4, "Apply the natural logarithm to every probability. Products become sums, and every class receives one weight per vocabulary feature. The log prior becomes the bias weight.")}
    <div class="table-wrap">
      <table class="weight-table">
        <thead><tr><th rowspan="2">Feature</th><th colspan="2" class="positive-text">Positive class</th><th colspan="2" class="negative-text">Negative class</th></tr><tr><th>Probability</th><th>Log weight</th><th>Probability</th><th>Log weight</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="vocabulary"><strong>Important:</strong> the bias is not a word probability. Its weight is <code>log p(class)</code>, so it preserves the class balance of the training corpus.</p>`;
}

function vectorGrid(rows) {
  const features = modelFeatures();
  const header = ["feature", ...features].map((value) => `<div class="vector-cell heading">${value}</div>`).join("");
  const body = rows.map((row) => {
    const cells = row.values.map((value, index) => {
      const classes = ["vector-cell"];
      if (index === 0) classes.push("bias");
      if (row.active && row.active(value, index)) classes.push("active");
      if (Number(value) === 0) classes.push("zero");
      return `<div class="${classes.join(" ")}">${row.format ? row.format(value) : value}</div>`;
    }).join("");
    return `<div class="vector-cell row-label">${row.label}</div>${cells}`;
  }).join("");
  return `<div class="vector-wrap"><div class="vector-grid" style="grid-template-columns: 7rem repeat(${features.length}, minmax(4.9rem, 1fr)); min-width: ${Math.max(760, 112 + features.length * 78)}px">${header}${body}</div></div>`;
}

function renderVectorStage(analysis) {
  return `
    ${stageHeading(5, "Fix one position for the bias and one for every vocabulary word. Store the constant 1 in the bias position and the sentence's word counts in the remaining positions.")}
    <p class="mobile-hint">Swipe the vector sideways to see every feature position.</p>
    ${vectorGrid([{ label: "x′", values: analysis.features, active: (value) => value > 0 }])}
    <p class="vector-caption"><strong>Feature order:</strong> [${modelFeatures().join(", ")}]. The first value is always 1, even though “bias” is not a word. Absent words receive 0, so their weights will contribute nothing to the dot product.</p>
    <p class="vocabulary"><strong>Why counts?</strong> If any vocabulary word appears twice, its feature becomes 2 and its log weight is added twice—exactly as its probability is multiplied twice.</p>`;
}

function renderDotCard(className, analysis) {
  const result = analysis.results[className];
  const rows = [
    { label: "x′", values: result.features, active: (value) => value > 0 },
    { label: `w′ ${className}`, values: MODEL.classes[className].weights, format: formatLog },
    { label: "x′ × w′", values: result.contributions, format: formatLog, active: (value) => value !== 0 },
  ];
  return `
    <article class="dot-card ${className}">
      <h3 class="${className}-text">${classLabel(className)} dot product</h3>
      ${vectorGrid(rows)}
      <div class="dot-result"><span>Add the bottom row:</span><strong>${result.contributions.map(formatLog).join(" + ")} ≈ ${formatLog(result.logScore)}</strong></div>
    </article>`;
}

function renderDotStage(analysis) {
  const exponentCards = CLASSES.map((className) => {
    const result = analysis.results[className];
    return `
      <article class="exponent-card ${className}">
        <span class="class-label">${classLabel(className)}</span>
        <p class="score-number">exp(${formatLog(result.logScore)})</p>
        <p class="score-number">≈ ${formatScore(result.recoveredScore)}</p>
        <p class="muted">Original product score: ${formatScore(result.productScore)}</p>
      </article>`;
  }).join("");
  return `
    ${stageHeading(6, "A dot product multiplies corresponding positions and adds the results. The feature headers make the alignment explicit: every count must meet the weight for the same feature.")}
    <p class="mobile-hint">Swipe each vector sideways to follow all ${modelFeatures().length} aligned feature positions.</p>
    ${CLASSES.map((className) => renderDotCard(className, analysis)).join("")}
    <p class="vector-caption">Displayed log weights and contributions are rounded to three decimals; the totals and recovered scores are calculated with full precision.</p>
    <div class="equivalence">
      <div class="exponent-grid">${exponentCards}</div>
      <div class="equivalence-arrow" aria-hidden="true">↔</div>
      <div class="winner"><strong>Same winner: ${classLabel(analysis.prediction)}.</strong><br>Taking logs changes multiplication into addition but preserves order. Exponentiating each log score recovers its original unnormalized probability-space score.</div>
    </div>
    <p class="posterior"><strong>One final distinction:</strong> these recovered scores do not yet sum to 1. The final stage places them back into Bayes' Rule and normalizes them.</p>`;
}

function renderBayesStage(analysis) {
  const evidence = CLASSES.reduce((sum, className) => sum + analysis.results[className].productScore, 0);
  const cards = CLASSES.map((className) => {
    const result = analysis.results[className];
    const classModel = MODEL.classes[className];
    const percentage = result.posterior * 100;
    return `
      <article class="bayes-card ${className}">
        <span class="class-label">${classLabel(className)} posterior</span>
        <div class="bayes-terms">
          <span><em>p</em>(text | ${className})</span><span class="operator">×</span><span><em>p</em>(${className})</span><span class="operator">=</span><span>score</span>
          <strong>${formatScore(result.likelihood)}</strong><span class="operator">×</span><strong>${fraction(classModel.documentCount, MODEL.documentTotal)}</strong><span class="operator">=</span><strong>${formatScore(result.productScore)}</strong>
        </div>
        <div class="normalization-fraction">
          <span>${formatScore(result.productScore)}</span>
          <span>${formatScore(analysis.results.positive.productScore)} + ${formatScore(analysis.results.negative.productScore)}</span>
        </div>
        <div class="posterior-value">= ${result.posterior.toFixed(3)}</div>
        <div class="posterior-track" aria-label="${classLabel(className)} posterior ${(percentage).toFixed(1)} percent">
          <span style="width: ${percentage}%"></span>
        </div>
        <p>${percentage.toFixed(1)}%</p>
      </article>`;
  }).join("");
  return `
    ${stageHeading(7, "Bayes' Rule divides each likelihood-times-prior score by the total probability of the text. With two classes, that evidence term is simply the sum of the two unnormalized scores.")}
    <div class="bayes-equation">
      <span><em>p</em>(class | text)</span>
      <span class="operator">=</span>
      <span class="normalization-fraction"><span><em>p</em>(text | class) <em>p</em>(class)</span><span><em>p</em>(text)</span></span>
      <span class="operator">=</span>
      <span class="normalization-fraction"><span>class score</span><span>positive score + negative score</span></span>
    </div>
    <p class="evidence"><strong>Evidence:</strong> p(text) = ${formatScore(analysis.results.positive.productScore)} + ${formatScore(analysis.results.negative.productScore)} = ${formatScore(evidence)}</p>
    <div class="score-grid">${cards}</div>
    <p class="posterior"><strong>Check:</strong> ${analysis.results.positive.posterior.toFixed(3)} + ${analysis.results.negative.posterior.toFixed(3)} ≈ 1. The posteriors now form a probability distribution, while the predicted class remains ${classLabel(analysis.prediction)}.</p>`;
}

const RENDERERS = [
  renderCorpusStage,
  renderCountsStage,
  renderSmoothingStage,
  renderMultiplyStage,
  renderLogStage,
  renderVectorStage,
  renderDotStage,
  renderBayesStage,
];

if (typeof module !== "undefined") {
  module.exports = {
    TRAINING_CORPUS,
    VOCABULARY,
    FEATURES,
    tokenize,
    deriveVocabulary,
    corpusFromText,
    trainModel,
    classify,
  };
}

if (typeof document !== "undefined") {
  const elements = {
    sentence: document.querySelector("#sentence"),
    resetSentence: document.querySelector("#reset-sentence"),
    positiveCorpus: document.querySelector("#positive-corpus"),
    negativeCorpus: document.querySelector("#negative-corpus"),
    rebuildCorpus: document.querySelector("#rebuild-corpus"),
    resetCorpus: document.querySelector("#reset-corpus"),
    corpusError: document.querySelector("#corpus-error"),
    unknownNote: document.querySelector("#unknown-note"),
    steps: document.querySelector("#steps"),
    stage: document.querySelector("#stage"),
    previous: document.querySelector("#previous"),
    next: document.querySelector("#next"),
  };
  let currentStage = 0;

  function renderSteps() {
    elements.steps.replaceChildren();
    STAGES.forEach((stage, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("active", index === currentStage);
      button.setAttribute("aria-current", index === currentStage ? "step" : "false");
      button.innerHTML = `<span class="step-number">STEP ${index + 1}</span><span class="step-name">${stage.name}</span>`;
      button.addEventListener("click", () => setStage(index));
      item.append(button);
      elements.steps.append(item);
    });
  }

  function render() {
    const analysis = classify(elements.sentence.value, MODEL);
    elements.stage.innerHTML = RENDERERS[currentStage](analysis);
    elements.previous.disabled = currentStage === 0;
    elements.next.disabled = currentStage === STAGES.length - 1;
    if (currentStage === STAGES.length - 2) {
      elements.next.textContent = "Normalize with Bayes";
    } else if (currentStage === STAGES.length - 3) {
      elements.next.textContent = "See dot products";
    } else {
      elements.next.textContent = "Next";
    }
    const unknown = [...new Set(analysis.unknownTokens)];
    elements.unknownNote.hidden = unknown.length === 0;
    elements.unknownNote.textContent = unknown.length === 0
      ? ""
      : `Outside the ${MODEL.vocabulary.length}-word training vocabulary and skipped: ${unknown.join(", ")}.`;
    renderSteps();
  }

  function setStage(index) {
    currentStage = Math.max(0, Math.min(STAGES.length - 1, index));
    render();
  }

  elements.sentence.addEventListener("input", render);
  elements.resetSentence.addEventListener("click", () => {
    elements.sentence.value = DEFAULT_SENTENCE;
    render();
  });
  elements.rebuildCorpus.addEventListener("click", () => {
    try {
      MODEL = trainModel(corpusFromText(elements.positiveCorpus.value, elements.negativeCorpus.value));
      elements.corpusError.hidden = true;
      elements.corpusError.textContent = "";
      render();
    } catch (error) {
      elements.corpusError.hidden = false;
      elements.corpusError.textContent = error.message;
    }
  });
  elements.resetCorpus.addEventListener("click", () => {
    elements.positiveCorpus.value = TRAINING_CORPUS
      .filter((document) => document.className === "positive")
      .map((document) => document.text)
      .join("\n");
    elements.negativeCorpus.value = TRAINING_CORPUS
      .filter((document) => document.className === "negative")
      .map((document) => document.text)
      .join("\n");
    MODEL = trainModel();
    elements.corpusError.hidden = true;
    elements.corpusError.textContent = "";
    render();
  });
  elements.previous.addEventListener("click", () => setStage(currentStage - 1));
  elements.next.addEventListener("click", () => setStage(currentStage + 1));

  render();
}
