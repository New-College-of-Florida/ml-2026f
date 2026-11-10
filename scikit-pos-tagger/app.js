(function (global) {
  "use strict";

  const CODE_LINES = [
    { text: "import pickle", scene: "imports" },
    { text: "", scene: "imports" },
    { text: 'train = pickle.load(open("wsj00-18.pkl", "rb"))', scene: "load-train" },
    { text: 'dev = pickle.load(open("wsj19-21.pkl", "rb"))', scene: "load-dev" },
    { text: 'test = pickle.load(open("wsj22-24.pkl", "rb"))', scene: "load-test" },
    { text: "", scene: "load-test" },
    { text: "from sklearn.feature_extraction import DictVectorizer", scene: "import-vectorizer" },
    { text: "from sklearn.metrics import accuracy_score", scene: "import-metric" },
    { text: "from sklearn.linear_model import Perceptron", scene: "import-model" },
    { text: "", scene: "import-model" },
    { text: "", scene: "import-model" },
    { text: "def datatodict(data):", scene: "function" },
    { text: "    X, y = [], []", scene: "empty-lists" },
    { text: "", scene: "empty-lists" },
    { text: "    for i, (word, tag) in enumerate(data):", scene: "loop" },
    { text: "        feats = {}", scene: "empty-dict" },
    { text: "        feats[word] = 1                              # word", scene: "feature-word" },
    { text: "", scene: "feature-word" },
    { text: "        if i > 0:", scene: "condition-previous" },
    { text: '            feats["p1:" + data[i-1][0].lower()] = 1  # previous word', scene: "feature-p1" },
    { text: '            if data[i-1][0] == ".":', scene: "condition-initial" },
    { text: '                feats["S.I"] = 1                    # sentence initial', scene: "feature-initial" },
    { text: "", scene: "feature-initial" },
    { text: '        feats["LCW:" + word.lower()] = 1             # lowercase word', scene: "feature-lower" },
    { text: "", scene: "feature-lower" },
    { text: "        if i > 1:", scene: "condition-p2" },
    { text: '            feats["p2:" + data[i-2][0].lower()] = 1  # word - 2', scene: "feature-p2" },
    { text: "", scene: "feature-p2" },
    { text: '        if i > 0 and data[i-1][0] != ".":', scene: "condition-cap-context" },
    { text: "            if word[0].isupper():", scene: "condition-initcap" },
    { text: '                feats["INITCAP"] = 1                 # initial capital', scene: "feature-initcap" },
    { text: "            if word.isupper():", scene: "condition-allcap" },
    { text: '                feats["ALLCAP"] = 1                  # all capitals', scene: "feature-allcap" },
    { text: "", scene: "feature-allcap" },
    { text: "        for sufflen in range(1, 6):", scene: "condition-suffix" },
    { text: '            feats[word[-sufflen:] + "#"] = 1         # suffixes 1-5', scene: "feature-suffix" },
    { text: "", scene: "feature-suffix" },
    { text: "        if i < len(data) - 1:", scene: "condition-next" },
    { text: '            feats["n:" + data[i+1][0]] = 1           # next word', scene: "feature-next" },
    { text: "", scene: "feature-next" },
    { text: "        X.append(feats)", scene: "append-x" },
    { text: "        y.append(tag)", scene: "append-y" },
    { text: "", scene: "append-y" },
    { text: "    return X, y", scene: "return-data" },
    { text: "", scene: "return-data" },
    { text: "", scene: "return-data" },
    { text: "examples, y = datatodict(train)", scene: "make-train" },
    { text: "testexamples, testy = datatodict(test)", scene: "make-test" },
    { text: "", scene: "make-test" },
    { text: "vectorizer = DictVectorizer(sparse=True)", scene: "vectorizer" },
    { text: "X = vectorizer.fit_transform(examples)", scene: "fit-transform" },
    { text: "testX = vectorizer.transform(testexamples)", scene: "transform-test" },
    { text: "", scene: "transform-test" },
    { text: "clf = Perceptron()", scene: "estimator" },
    { text: "clf.fit(X, y)", scene: "fit" },
    { text: "", scene: "fit" },
    { text: 'print("Perceptron accuracy:", accuracy_score(testy, clf.predict(testX)))', scene: "accuracy" },
  ];

  const EXAMPLE = [
    ["The", "DT"],
    ["U.S.", "NNP"],
    ["software", "NN"],
    ["market", "NN"],
    ["expanded", "VBD"],
    ["rapidly", "RB"],
    [".", "."],
  ];
  const CURRENT_INDEX = 3;

  const FEATURE_ORDER = [
    "market",
    "p1:software",
    "LCW:market",
    "p2:u.s.",
    "t#",
    "et#",
    "ket#",
    "rket#",
    "arket#",
    "n:expanded",
  ];

  const FEATURE_PROGRESS = {
    "empty-dict": 0,
    "feature-word": 1,
    "condition-previous": 1,
    "feature-p1": 2,
    "condition-initial": 2,
    "feature-initial": 2,
    "feature-lower": 3,
    "condition-p2": 3,
    "feature-p2": 4,
    "condition-cap-context": 4,
    "condition-initcap": 4,
    "feature-initcap": 4,
    "condition-allcap": 4,
    "feature-allcap": 4,
    "condition-suffix": 4,
    "feature-suffix": 9,
    "condition-next": 9,
    "feature-next": 10,
    "append-x": 10,
    "append-y": 10,
  };

  function extractFeatures(data, index) {
    const [word, tag] = data[index];
    const features = {};
    features[word] = 1;
    if (index > 0) {
      features[`p1:${data[index - 1][0].toLowerCase()}`] = 1;
      if (data[index - 1][0] === ".") features["S.I"] = 1;
    }
    features[`LCW:${word.toLowerCase()}`] = 1;
    if (index > 1) features[`p2:${data[index - 2][0].toLowerCase()}`] = 1;
    if (index > 0 && data[index - 1][0] !== ".") {
      if (/^[A-Z]/.test(word)) features.INITCAP = 1;
      if (word.toUpperCase() === word && word.toLowerCase() !== word) features.ALLCAP = 1;
    }
    for (let length = 1; length < 6; length += 1) {
      features[`${word.slice(-length)}#`] = 1;
    }
    if (index < data.length - 1) features[`n:${data[index + 1][0]}`] = 1;
    return { features, tag };
  }

  function buildVocabulary(featureRows) {
    return [...new Set(featureRows.flatMap((row) => Object.keys(row)))].sort();
  }

  function vectorize(featureRows, vocabulary) {
    return featureRows.map((row) => vocabulary.map((feature) => row[feature] || 0));
  }

  function toCSR(matrix) {
    const data = [];
    const indices = [];
    const indptr = [0];
    matrix.forEach((row) => {
      row.forEach((value, column) => {
        if (value !== 0) {
          data.push(value);
          indices.push(column);
        }
      });
      indptr.push(data.length);
    });
    return { data, indices, indptr };
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function colorizePython(source) {
    const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|\b(?:import|from|def|for|in|if|return)\b|\b(?:True|False|None)\b|\b\d+(?:\.\d+)?\b)/g;
    let html = "";
    let last = 0;
    for (const match of source.matchAll(pattern)) {
      html += escapeHTML(source.slice(last, match.index));
      const token = match[0];
      let className = "token-number";
      if (token.startsWith('"') || token.startsWith("'")) className = "token-string";
      else if (token.startsWith("#")) className = "token-comment";
      else if (/^(import|from|def|for|in|if|return)$/.test(token)) className = "token-keyword";
      html += `<span class="${className}">${escapeHTML(token)}</span>`;
      last = match.index + token.length;
    }
    return html + escapeHTML(source.slice(last));
  }

  function sentenceHTML(scene) {
    const showP1 = ["feature-p1", "condition-initial", "feature-initial", "feature-lower", "condition-p2", "feature-p2", "condition-cap-context", "condition-initcap", "feature-initcap", "condition-allcap", "feature-allcap", "condition-suffix", "feature-suffix", "condition-next", "feature-next", "append-x", "append-y"].includes(scene);
    const showP2 = ["feature-p2", "condition-cap-context", "condition-initcap", "feature-initcap", "condition-allcap", "feature-allcap", "condition-suffix", "feature-suffix", "condition-next", "feature-next", "append-x", "append-y"].includes(scene);
    const showNext = ["feature-next", "append-x", "append-y"].includes(scene);
    return `<div class="sentence">${EXAMPLE.map(([word, tag], index) => {
      let className = "word-token";
      if (index === CURRENT_INDEX) className += " current";
      else if ((showP1 && index === CURRENT_INDEX - 1) || (showP2 && index === CURRENT_INDEX - 2)) className += " context";
      else if (showNext && index === CURRENT_INDEX + 1) className += " next";
      return `<div class="${className}"><strong>${escapeHTML(word)}</strong><span>${escapeHTML(tag)}</span></div>`;
    }).join("")}</div>`;
  }

  function featureExplanation(scene) {
    const explanations = {
      "empty-dict": ["Start empty", "One dictionary will describe one tagging decision."],
      "feature-word": ["Current word", "The exact surface form becomes a feature."],
      "condition-previous": ["Check the position", "i = 3, so a previous word exists."],
      "feature-p1": ["Previous word", "software is lowercased and prefixed with p1:."],
      "condition-initial": ["Sentence-initial test", "The previous word is not a period, so this condition is false."],
      "feature-initial": ["Skip S.I", "market is not sentence-initial, so no S.I feature is added."],
      "feature-lower": ["Lowercase word", "A second lexical feature lets Market and market share evidence."],
      "condition-p2": ["Look two words back", "i = 3, so position i − 2 is available."],
      "feature-p2": ["Two-back word", "U.S. becomes the lowercased feature p2:u.s.."],
      "condition-cap-context": ["Ignore sentence capitalization", "The previous word is not a period, so capitalization may be informative."],
      "condition-initcap": ["Initial capital?", "market starts with m, so the condition is false."],
      "feature-initcap": ["Skip INITCAP", "This feature would be added for a word such as Market away from sentence start."],
      "condition-allcap": ["All capitals?", "market is not all uppercase."],
      "feature-allcap": ["Skip ALLCAP", "This feature would fire for a token such as NASA."],
      "condition-suffix": ["Five loop iterations", "sufflen takes the values 1, 2, 3, 4, and 5."],
      "feature-suffix": ["Suffix features", "The loop adds t#, et#, ket#, rket#, and arket#."],
      "condition-next": ["Can we look ahead?", "The words are observed at tagging time, so using the next word is legitimate."],
      "feature-next": ["Next word", "The next observed word is expanded."],
      "append-x": ["Store the example", "The finished dictionary becomes one row-shaped training example."],
      "append-y": ["Store the answer", "The gold tag NN is stored separately in y."],
    };
    return explanations[scene] || ["Build one example", "The highlighted word is the token currently being described."];
  }

  function dictionaryHTML(scene) {
    const count = FEATURE_PROGRESS[scene] ?? 0;
    const rows = FEATURE_ORDER.slice(0, count);
    let skipped = "";
    if (scene === "feature-initial") skipped = '<div class="dict-row skipped"><span>"S.I"</span><span>1</span></div>';
    if (scene === "feature-initcap") skipped = '<div class="dict-row skipped"><span>"INITCAP"</span><span>1</span></div>';
    if (scene === "feature-allcap") skipped = '<div class="dict-row skipped"><span>"ALLCAP"</span><span>1</span></div>';
    return `<div class="dictionary"><div>{</div>${rows.map((feature, index) => `<div class="dict-row ${index === rows.length - 1 ? "new" : ""}"><span>&nbsp;&nbsp;"${escapeHTML(feature)}":</span><span>1,</span></div>`).join("")}${skipped}<div>}</div></div>`;
  }

  function renderData(scene) {
    const active = scene.replace("load-", "");
    return `<div class="scene">
      <h2>Three standard corpus splits</h2>
      <p>Each pickle contains a flat list of <code>(word, tag)</code> tuples. The sections were fixed before this experiment—not selected after seeing the results.</p>
      <div class="cards">
        <div class="card ${active === "train" ? "active" : ""}"><span class="metric">912,344</span><h3>Train · sections 00–18</h3><p class="small">Fit the feature vocabulary and model weights.</p></div>
        <div class="card ${active === "dev" ? "active" : ""}"><span class="metric">131,768</span><h3>Dev · sections 19–21</h3><p class="small">Available for later feature or model tuning.</p></div>
        <div class="card ${active === "test" ? "active" : ""}"><span class="metric">129,654</span><h3>Test · sections 22–24</h3><p class="small">Report the final held-out accuracy.</p></div>
      </div>
      <div class="pipeline"><span class="step on">pickle file</span><span class="arrow">→</span><span class="step">Python list</span><span class="arrow">→</span><span class="step">('Pierre', 'NNP')</span></div>
    </div>`;
  }

  function renderImports(scene) {
    const cards = [
      ["import-vectorizer", "DictVectorizer", "dictionaries → matrix"],
      ["import-metric", "accuracy_score", "gold tags vs. predictions"],
      ["import-model", "Perceptron", "fit weights and predict tags"],
    ];
    return `<div class="scene"><h2>Import only the pieces we need</h2><p>scikit-learn organizes preprocessing, models, and evaluation as separate objects with compatible interfaces.</p><div class="cards">${cards.map(([key, title, copy]) => `<div class="card ${scene === key ? "active" : ""}"><h3>${title}</h3><p class="small">${copy}</p></div>`).join("")}</div><div class="pipeline"><span class="step">feature dictionaries</span><span class="arrow">→</span><span class="step on">vectorizer</span><span class="arrow">→</span><span class="step on">classifier</span><span class="arrow">→</span><span class="step on">metric</span></div></div>`;
  }

  function renderFeatureScene(scene) {
    const [title, explanation] = featureExplanation(scene);
    return `<div class="scene"><h2>Build the dictionary: ${title}</h2><p>Our example is the middle word <strong>market</strong>, whose gold POS tag is <strong>NN</strong>.</p>${sentenceHTML(scene)}<div class="dict-wrap">${dictionaryHTML(scene)}<div class="explain-box"><strong>${title}</strong><p>${explanation}</p><div class="condition">i = 3 · word = "market" · tag = "NN"</div></div></div></div>`;
  }

  function toyFeatureRows() {
    return EXAMPLE.slice(0, 6).map((_, index) => extractFeatures(EXAMPLE, index).features);
  }

  function renderLists(scene) {
    const features = extractFeatures(EXAMPLE, CURRENT_INDEX).features;
    const showY = ["append-y", "return-data", "make-train", "make-test"].includes(scene);
    const many = ["make-train", "make-test"].includes(scene);
    return `<div class="scene"><h2>${many ? "Repeat for every token" : "Keep features and labels separate"}</h2><p>${many ? "datatodict runs the same recipe across the selected corpus split." : "X receives dictionaries. y receives the answers the classifier should learn to predict."}</p><div class="dict-wrap"><div><h3>X · feature dictionaries</h3><div class="dictionary"><div>[</div><div class="dict-row"><span>&nbsp;&nbsp;{ ${Object.keys(features).slice(0, 4).map((key) => `"${escapeHTML(key)}": 1`).join(", ")}, … }</span></div>${many ? '<div class="dict-row"><span>&nbsp;&nbsp;{ next token’s features … }</span></div><div class="dict-row"><span>&nbsp;&nbsp;⋮</span></div>' : ""}<div>]</div></div></div><div><h3>y · gold tags</h3><div class="dictionary"><div>[</div>${showY ? '<div class="dict-row new"><span>&nbsp;&nbsp;"NN",</span></div>' : '<div class="dict-row"><span>&nbsp;&nbsp;waiting …</span></div>'}${many ? '<div class="dict-row"><span>&nbsp;&nbsp;"VBD", "RB", …</span></div>' : ""}<div>]</div></div></div></div>${many ? `<div class="cards"><div class="card active"><span class="metric">${scene === "make-train" ? "912,344" : "129,654"}</span><h3>${scene === "make-train" ? "training" : "test"} dictionaries</h3></div><div class="card"><span class="metric">same</span><h3>number of gold tags</h3></div></div>` : ""}</div>`;
  }

  function matrixTableHTML() {
    const rows = toyFeatureRows();
    const selected = ["The", "U.S.", "software", "market", "LCW:market", "p1:software", "p2:u.s.", "t#", "et#", "n:expanded", "INITCAP", "ALLCAP"];
    return `<div class="matrix-scroll"><table class="matrix"><thead><tr><th>word</th>${selected.map((feature) => `<th class="column">${escapeHTML(feature)}</th>`).join("")}<th class="ellipsis">…</th><th>tag</th></tr></thead><tbody>${rows.slice(0, 5).map((row, index) => `<tr><th>${escapeHTML(EXAMPLE[index][0])}</th>${selected.map((feature) => `<td class="${row[feature] ? "one" : ""}">${row[feature] || ""}</td>`).join("")}<td class="ellipsis">…</td><th>${escapeHTML(EXAMPLE[index][1])}</th></tr>`).join("")}</tbody></table></div>`;
  }

  function renderVectorizer(scene) {
    if (scene === "vectorizer") {
      return `<div class="scene"><h2>Learn a column for every feature name</h2><p><code>DictVectorizer</code> gathers the keys from the training dictionaries. Each distinct key receives a stable column number.</p><div class="pipeline"><span class="step">{"market": 1}</span><span class="step">{"INITCAP": 1}</span><span class="step">{"t#": 1}</span><span class="arrow">→</span><span class="step on">sorted feature vocabulary</span></div><div class="cards"><div class="card"><span class="metric">0</span><h3>!#</h3></div><div class="card"><span class="metric">1</span><h3>"#</h3></div><div class="card"><span class="metric">…</span><h3>thousands more</h3></div></div></div>`;
    }

    const rows = toyFeatureRows();
    const vocabulary = buildVocabulary(rows);
    const csr = toCSR(vectorize(rows, vocabulary));
    if (scene === "transform-test") {
      return `<div class="scene"><h2>Reuse the training columns</h2><p><code>transform</code> does not learn a new vocabulary. It places test features into the existing training columns, so train and test matrices mean the same thing.</p>${matrixTableHTML()}<div class="explain-box"><strong>Why not fit_transform again?</strong><p>A separately fitted test vectorizer could assign a different column number to every feature—and would learn from the test set.</p></div></div>`;
    }

    return `<div class="scene"><h2>Dictionaries become a sparse matrix</h2><p>One token becomes one row; one feature name becomes one column. Almost every cell is zero, so storing the dense rectangle would be wasteful.</p>${matrixTableHTML()}<div class="csr"><div class="csr-row"><strong>data</strong><span class="array-values">[${csr.data.slice(0, 20).join(", ")}, …]</span></div><div class="csr-row"><strong>indices</strong><span class="array-values">[${csr.indices.slice(0, 20).join(", ")}, …]</span></div><div class="csr-row"><strong>indptr</strong><span class="array-values">[${csr.indptr.slice(0, 7).join(", ")}]</span></div></div><p class="small"><strong>CSR (compressed sparse row)</strong> stores each nonzero value, its column index, and the point where each row begins. The real training matrix has 912,344 rows and 236,880 columns, but averages only 8.69 stored values per row.</p></div>`;
  }

  function renderEstimator() {
    return `<div class="scene"><h2>Choose an estimator; keep the interface</h2><p>The feature matrix does not belong to the perceptron. Any classifier that accepts sparse matrices and implements <code>fit</code> and <code>predict</code> can take its place.</p><div class="estimator-grid"><div class="estimator selected"><h3>Perceptron</h3><code>Perceptron()</code><p class="small">Mistake-driven linear classifier.</p></div><div class="estimator"><h3>Perceptron via SGD</h3><code>SGDClassifier(loss="perceptron")</code><p class="small">Same loss in the general SGD interface.</p></div><div class="estimator"><h3>Logistic regression</h3><code>SGDClassifier(loss="log_loss")</code><p class="small">Probabilistic linear classifier.</p></div><div class="estimator"><h3>Linear SVM</h3><code>SGDClassifier(loss="hinge")</code><p class="small">Margin-based linear classifier.</p></div></div><div class="pipeline"><span class="step on">clf.fit(X, y)</span><span class="step on">clf.predict(testX)</span><span class="step">same two method calls</span></div></div>`;
  }

  function renderFit() {
    return `<div class="scene"><h2>Fit weights from rows and answers</h2><p>The perceptron repeatedly scores a sparse row. On a mistake, it rewards the gold tag's active weights and penalizes the incorrect prediction's active weights.</p><div class="fit-visual"><div class="fit-block"><strong>X</strong>912,344 sparse rows</div><div class="fit-arrow">+</div><div class="fit-block"><strong>y</strong>912,344 gold tags</div><div class="fit-arrow">→</div><div class="fit-block"><strong>clf</strong>one weight vector per POS tag</div></div><div class="pipeline"><span class="step">market = 1</span><span class="step">p1:software = 1</span><span class="step">t# = 1</span><span class="arrow">→</span><span class="step on">score every tag</span><span class="arrow">→</span><span class="step">update on mistakes</span></div></div>`;
  }

  function renderAccuracy() {
    return `<div class="scene"><h2>Compare predictions with held-out tags</h2><p><code>clf.predict(testX)</code> returns one predicted tag per test row. <code>accuracy_score</code> asks what proportion exactly match <code>testy</code>.</p><div class="accuracy-display"><div class="accuracy-ring"><div>94.52%</div></div><div><table class="tag-table"><thead><tr><th>word</th><th>gold</th><th>predicted</th></tr></thead><tbody><tr><td>Influential</td><td>JJ</td><td class="right">JJ</td></tr><tr><td>members</td><td>NNS</td><td class="right">NNS</td></tr><tr><td>introduced</td><td>VBD</td><td class="right">VBD</td></tr><tr><td>that</td><td>WDT</td><td class="wrong">IN</td></tr></tbody></table><p class="small">Illustrative token-level predictions; the aggregate count and accuracy are from the full run.</p></div></div><div class="pipeline"><span class="step">129,654 test tokens</span><span class="arrow">→</span><span class="step on">122,550 correct</span><span class="arrow">→</span><span class="step">accuracy = correct / total</span></div></div>`;
  }

  function renderScene(scene) {
    if (scene === "imports") return `<div class="scene"><h2>Load Python's pickle module</h2><p>The expensive corpus preparation has already happened. The notebook starts with ready-to-use Python lists.</p><div class="pipeline"><span class="step on">disk</span><span class="arrow">→</span><span class="step">pickle.load</span><span class="arrow">→</span><span class="step">list of tuples</span></div></div>`;
    if (scene.startsWith("load-")) return renderData(scene);
    if (scene.startsWith("import-")) return renderImports(scene);
    if (scene === "function") return `<div class="scene"><h2>Define one feature-extraction recipe</h2><p>The function will receive a list of tagged words and return two aligned lists: dictionaries in X and their correct POS tags in y.</p><div class="pipeline"><span class="step on">tagged tokens</span><span class="arrow">→</span><span class="step">datatodict</span><span class="arrow">→</span><span class="step">X: dictionaries</span><span class="step">y: tags</span></div></div>`;
    if (scene === "empty-lists") return `<div class="scene"><h2>Prepare parallel lists</h2><p>Index <em>i</em> in X and index <em>i</em> in y describe the same token.</p><div class="dict-wrap"><div><h3>X</h3><div class="dictionary">[]</div><p class="small">Feature dictionaries</p></div><div><h3>y</h3><div class="dictionary">[]</div><p class="small">Gold POS tags</p></div></div></div>`;
    if (scene === "loop") return `<div class="scene"><h2>Visit every word/tag pair</h2><p><code>enumerate</code> supplies both the position and the tuple at that position. We pause at the middle word in this toy sentence.</p>${sentenceHTML(scene)}<div class="cards"><div class="card"><span class="metric">i = 3</span><h3>position</h3></div><div class="card"><span class="metric">market</span><h3>word</h3></div><div class="card"><span class="metric">NN</span><h3>gold tag</h3></div></div></div>`;
    if (scene in FEATURE_PROGRESS) return renderFeatureScene(scene);
    if (["return-data", "make-train", "make-test"].includes(scene)) return renderLists(scene);
    if (["vectorizer", "fit-transform", "transform-test"].includes(scene)) return renderVectorizer(scene);
    if (scene === "estimator") return renderEstimator();
    if (scene === "fit") return renderFit();
    if (scene === "accuracy") return renderAccuracy();
    return `<div class="scene"><h2>One compact pipeline</h2><p>Move down through the code to connect each line to its data structure.</p></div>`;
  }

  function sceneHeading(scene) {
    if (scene.startsWith("load-") || scene === "imports") return ["Data", "Load the corpus"];
    if (scene.startsWith("import-")) return ["Tools", "Choose the scikit-learn pieces"];
    if (["function", "empty-lists", "loop"].includes(scene) || scene in FEATURE_PROGRESS) return ["Feature design", "Turn one word into a dictionary"];
    if (["return-data", "make-train", "make-test"].includes(scene)) return ["Examples", "Build X and y"];
    if (["vectorizer", "fit-transform", "transform-test"].includes(scene)) return ["Vectorization", "Dictionaries become matrix rows"];
    if (["estimator", "fit"].includes(scene)) return ["Classification", "Train an interchangeable estimator"];
    return ["Evaluation", "Measure held-out accuracy"];
  }

  function initialize() {
    const codeWindow = document.querySelector("#code-window");
    const visual = document.querySelector("#visual-content");
    const stageLabel = document.querySelector("#stage-label");
    const stageTitle = document.querySelector("#stage-title");
    const lineStatus = document.querySelector("#line-status");
    const previous = document.querySelector("#previous");
    const next = document.querySelector("#next");
    const progress = document.querySelector("#progress");
    const navigable = CODE_LINES.map((line, index) => line.text.trim() ? index : -1).filter((index) => index >= 0);
    let position = 0;

    CODE_LINES.forEach((line, index) => {
      const row = document.createElement("div");
      row.className = `code-line${line.text ? "" : " blank"}`;
      row.dataset.index = index;
      row.innerHTML = `<span class="number">${line.text ? index + 1 : ""}</span><span class="source">${colorizePython(line.text)}</span>`;
      if (line.text) {
        row.tabIndex = 0;
        row.addEventListener("click", () => {
          position = navigable.indexOf(index);
          update();
        });
      }
      codeWindow.append(row);
    });

    function centerActiveLine(active) {
      const activeTop = active.getBoundingClientRect().top
        - codeWindow.getBoundingClientRect().top
        + codeWindow.scrollTop;
      codeWindow.scrollTop = activeTop
        - codeWindow.clientHeight / 2
        + active.clientHeight / 2;
    }

    function update() {
      const lineIndex = navigable[position];
      const line = CODE_LINES[lineIndex];
      document.querySelectorAll(".code-line.active").forEach((row) => row.classList.remove("active"));
      const active = codeWindow.querySelector(`[data-index="${lineIndex}"]`);
      active.classList.add("active");
      centerActiveLine(active);
      requestAnimationFrame(() => centerActiveLine(active));
      if (document.fonts) document.fonts.ready.then(() => centerActiveLine(active));
      const [label, title] = sceneHeading(line.scene);
      stageLabel.textContent = label;
      stageTitle.textContent = title;
      lineStatus.textContent = `line ${lineIndex + 1} · ${position + 1} of ${navigable.length}`;
      visual.innerHTML = renderScene(line.scene);
      progress.style.width = `${(position / (navigable.length - 1)) * 100}%`;
      previous.disabled = position === 0;
      next.disabled = position === navigable.length - 1;
      history.replaceState(null, "", `#line-${lineIndex + 1}`);
    }

    function move(amount) {
      position = Math.max(0, Math.min(navigable.length - 1, position + amount));
      update();
    }

    const requestedLine = Number(location.hash.replace("#line-", "")) - 1;
    const requestedPosition = navigable.indexOf(requestedLine);
    if (requestedPosition >= 0) position = requestedPosition;

    previous.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    document.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) {
        event.preventDefault();
        move(1);
      } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        position = 0;
        update();
      } else if (event.key === "End") {
        event.preventDefault();
        position = navigable.length - 1;
        update();
      }
    });
    update();
  }

  global.ScikitTaggerDemo = {
    CODE_LINES,
    EXAMPLE,
    extractFeatures,
    buildVocabulary,
    vectorize,
    toCSR,
    renderScene,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.ScikitTaggerDemo;
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", initialize);
}(globalThis));
