(function (global) {
  "use strict";

  const CODE_LINES = [
    { text: "import numpy as np", scene: "import" },
    { text: "", scene: "import" },
    { text: "VOCSIZE = 1000", scene: "vocab-size" },
    { text: 'line = open("wsjoneline.txt").read().strip()', scene: "load" },
    { text: "tokens = [word.lower() for word in line.split()]", scene: "tokens" },
    { text: "", scene: "tokens" },
    { text: "tokencounts = {}", scene: "counts-empty" },
    { text: "for word in tokens:", scene: "counts-loop" },
    { text: "    tokencounts[word] = tokencounts.get(word, 0) + 1", scene: "counts-add" },
    { text: "", scene: "counts-add" },
    { text: "tokentuples = sorted(tokencounts.items(),", scene: "counts-sort" },
    { text: "                     key=lambda x: x[1], reverse=True)", scene: "counts-sort" },
    { text: "vocabulary = [word for word, _ in tokentuples[:VOCSIZE]]", scene: "vocabulary" },
    { text: "tokentoidx = {word: i for i, word in enumerate(vocabulary)}", scene: "indices" },
    { text: "", scene: "indices" },
    { text: "WINDOW = 3", scene: "window" },
    { text: "fij = np.zeros((len(vocabulary), len(vocabulary)))", scene: "empty-matrix" },
    { text: "for i in range(len(tokens)):", scene: "target-loop" },
    { text: "    if tokens[i] not in tokentoidx:", scene: "target-filter" },
    { text: "        continue", scene: "target-filter" },
    { text: "    for j in range(i - WINDOW, i + WINDOW + 1):", scene: "context-loop" },
    { text: "        if (j == i or j < 0 or j >= len(tokens)", scene: "context-filter" },
    { text: "                or tokens[j] not in tokentoidx):", scene: "context-filter" },
    { text: "            continue", scene: "context-filter" },
    { text: "        fij[tokentoidx[tokens[i]], tokentoidx[tokens[j]]] += 1", scene: "increment" },
    { text: "", scene: "increment" },
    { text: "rowsums = fij.sum(axis=1)", scene: "row-sums" },
    { text: "colsums = fij.sum(axis=0)", scene: "column-sums" },
    { text: "total = fij.sum()", scene: "total" },
    { text: "", scene: "total" },
    { text: "pij = fij / total", scene: "joint" },
    { text: "pistar = rowsums / total", scene: "target-probability" },
    { text: "pstarj = colsums / total", scene: "context-probability" },
    { text: "", scene: "context-probability" },
    { text: "expected = np.outer(pistar, pstarj)", scene: "expected" },
    { text: "ratio = np.divide(pij, expected,", scene: "ratio" },
    { text: "                  out=np.ones_like(pij), where=pij > 0)", scene: "safe-divide" },
    { text: "ppmi = np.maximum(np.log2(ratio), 0)", scene: "ppmi" },
    { text: "", scene: "ppmi" },
    { text: "U, s, VT = np.linalg.svd(ppmi, full_matrices=False)", scene: "svd" },
    { text: "TM = U[:, :50] * s[:50]", scene: "truncate" },
    { text: "", scene: "truncate" },
    { text: "from sklearn.metrics.pairwise import cosine_similarity as cossim", scene: "cosine-import" },
    { text: "", scene: "cosine-import" },
    { text: "def find_similar(word, matrix, vocabulary, tokentoidx):", scene: "similar-function" },
    { text: "    similarities = {}", scene: "similar-empty" },
    { text: "    firstidx = tokentoidx[word]", scene: "similar-index" },
    { text: "    for secondword in vocabulary:", scene: "similar-loop" },
    { text: "        secondidx = tokentoidx[secondword]", scene: "similar-loop" },
    { text: "        similarities[secondword] = cossim(", scene: "cosine" },
    { text: "            matrix[firstidx].reshape(1, -1),", scene: "reshape-query" },
    { text: "            matrix[secondidx].reshape(1, -1),", scene: "reshape-candidate" },
    { text: "        )[0][0]", scene: "cosine-result" },
    { text: "    return sorted(similarities.items(),", scene: "sort-neighbors" },
    { text: "                  key=lambda x: x[1], reverse=True)", scene: "sort-neighbors" },
    { text: "", scene: "sort-neighbors" },
    { text: 'print(find_similar("equipment", TM, vocabulary, tokentoidx)[1:6])', scene: "neighbors" },
  ];

  const TOP_COUNTS = [
    [",", 60484], ["the", 59459], [".", 48144], ["of", 28440],
    ["to", 27448], ["a", 24781], ["in", 21047], ["and", 20449],
  ];
  const MATRIX_WORDS = ["employees", "workers", "equipment", "computer", "bought", "sold"];
  const COUNT_MATRIX = [
    [2, 1, 0, 0, 0, 0],
    [1, 2, 0, 0, 0, 0],
    [0, 0, 2, 4, 1, 1],
    [0, 0, 4, 4, 1, 0],
    [0, 0, 1, 1, 0, 12],
    [0, 0, 1, 0, 12, 0],
  ];
  const PPMI_MATRIX = [
    [2.44, 1.44, 0, 0, 0, 0],
    [1.44, 2.43, 0, 0, 0, 0],
    [0, 0, 2.96, 2.84, 2.16, 0.74],
    [0, 0, 2.84, 1.72, 1.04, 0],
    [0, 0, 2.16, 1.04, 0, 4.53],
    [0, 0, 0.74, 0, 4.53, 0],
  ];
  const CONTEXT = ["will", "require", "special", "robotic", "handling", "equipment", ".", "in", "addition"];
  const TARGET_INDEX = 5;
  const NEIGHBORS = [
    ["computer", 0.808],
    ["machines", 0.806],
    ["computers", 0.776],
    ["systems", 0.774],
    ["data", 0.754],
  ];

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function colorizePython(source) {
    const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|\b(?:import|from|def|for|in|if|or|continue|return|lambda)\b|\b(?:True|False|None)\b|\b\d+(?:\.\d+)?\b)/g;
    let html = "";
    let last = 0;
    for (const match of source.matchAll(pattern)) {
      html += escapeHTML(source.slice(last, match.index));
      const token = match[0];
      let className = "token-number";
      if (token.startsWith('"') || token.startsWith("'")) className = "token-string";
      else if (token.startsWith("#")) className = "token-comment";
      else if (/^(import|from|def|for|in|if|or|continue|return|lambda)$/.test(token)) className = "token-keyword";
      html += `<span class="${className}">${escapeHTML(token)}</span>`;
      last = match.index + token.length;
    }
    return html + escapeHTML(source.slice(last));
  }

  function ppmiValue(count, rowTotal, columnTotal, grandTotal) {
    if (count === 0) return 0;
    const observed = count / grandTotal;
    const expected = (rowTotal / grandTotal) * (columnTotal / grandTotal);
    return Math.max(Math.log2(observed / expected), 0);
  }

  function buildCooccurrence(tokens, windowSize) {
    const matrix = tokens.map(() => tokens.map(() => 0));
    tokens.forEach((_, i) => {
      for (let j = i - windowSize; j <= i + windowSize; j += 1) {
        if (j !== i && j >= 0 && j < tokens.length) matrix[i][j] += 1;
      }
    });
    return matrix;
  }

  function tokenStrip(mode) {
    return `<div class="sentence">${CONTEXT.map((word, index) => {
      const distance = Math.abs(index - TARGET_INDEX);
      let className = "word-token";
      if (index === TARGET_INDEX) className += " current";
      else if (["context-loop", "context-filter", "increment"].includes(mode) && distance <= 3) className += " context";
      return `<div class="${className}"><strong>${escapeHTML(word)}</strong><span>${index === TARGET_INDEX ? "center i" : `position ${index - TARGET_INDEX >= 0 ? "+" : ""}${index - TARGET_INDEX}`}</span></div>`;
    }).join("")}</div>`;
  }

  function countCards(limit = TOP_COUNTS.length) {
    return `<div class="cards">${TOP_COUNTS.slice(0, limit).map(([word, count]) => `<div class="card"><span class="metric">${count.toLocaleString()}</span><h3>${escapeHTML(word)}</h3><p>occurrences</p></div>`).join("")}</div>`;
  }

  function matrixTable(values, isPPMI = false) {
    return `<div class="matrix-scroll"><table class="matrix heatmap"><thead><tr><th>center ↓ / context →</th>${MATRIX_WORDS.map((word) => `<th class="column">${word}</th>`).join("")}</tr></thead><tbody>${values.map((row, rowIndex) => `<tr><th>${MATRIX_WORDS[rowIndex]}</th>${row.map((value) => {
      const level = value === 0 ? "" : value >= (isPPMI ? 3 : 8) ? "high" : value >= (isPPMI ? 1.5 : 3) ? "mid" : "low";
      return `<td class="${level}">${isPPMI ? value.toFixed(2) : value}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function probabilityScene(scene) {
    const details = {
      "row-sums": ["Count every context beside a center word", "For bought, the row contains 864 recorded context events.", "row sum = 864"],
      "column-sums": ["Count every center word beside a context", "For sold, the column contains 2,313 context events.", "column sum = 2,313"],
      total: ["Count every center–context event", "A token can contribute several neighbors, so this total exceeds the corpus token count.", "total = 3,849,232"],
      joint: ["Observed joint probability", "bought occurs with sold 12 times among all recorded pairs.", "p(bought, sold) = 12 / 3,849,232"],
      "target-probability": ["Center-word marginal probability", "Ignore the context column and ask how often bought supplies a matrix row event.", "p(bought, *) = 864 / 3,849,232"],
      "context-probability": ["Context marginal probability", "Ignore the center-word row and ask how often sold supplies a matrix column event.", "p(*, sold) = 2,313 / 3,849,232"],
    };
    const [title, copy, formula] = details[scene];
    return `<div class="scene"><h2>${title}</h2><p>${copy}</p>${matrixTable(COUNT_MATRIX)}<div class="formula-card"><strong>${formula}</strong></div></div>`;
  }

  function svdBlocks(truncated = false) {
    if (truncated) {
      return `<div class="factorization"><div class="matrix-block wide">TM<br>1,000 × 50<br><small>word embeddings</small></div><span class="times">=</span><div class="matrix-block">U[:, :50]<br>1,000 × 50</div><span class="times">×</span><div class="matrix-block thin gold">s[:50]<br>50</div></div>`;
    }
    return `<div class="factorization"><div class="matrix-block wide">PPMI<br>1,000 × 1,000</div><span class="times">=</span><div class="matrix-block">U<br>1,000 × 1,000</div><span class="times">×</span><div class="matrix-block gold">Σ<br>1,000 × 1,000<br><small>s stores its diagonal</small></div><span class="times">×</span><div class="matrix-block green">Vᵀ<br>1,000 × 1,000</div></div>`;
  }

  function neighborBars() {
    return `<div class="bar-list">${NEIGHBORS.map(([word, score]) => `<div class="bar-row"><strong>${word}</strong><div class="bar-track"><div class="bar-fill" style="width:${score * 100}%"></div></div><span>${score.toFixed(3)}</span></div>`).join("")}</div>`;
  }

  function renderScene(scene) {
    if (scene === "import") return `<div class="scene"><h2>NumPy supplies the matrix operations</h2><p>The algorithm begins with ordinary counts, but soon we will divide, multiply, and factorize entire matrices at once.</p><div class="pipeline"><span class="step on">Python tokens</span><span class="arrow">→</span><span class="step">NumPy matrices</span><span class="arrow">→</span><span class="step">word vectors</span></div></div>`;
    if (scene === "vocab-size") return `<div class="scene"><h2>Keep the 1,000 most frequent types</h2><p>A 1,000-word vocabulary produces a 1,000 × 1,000 word–context matrix. Rare words are ignored in this deliberately manageable example.</p><div class="cards"><div class="card active"><span class="metric">1,000</span><h3>center words</h3></div><div class="card"><span class="metric">1,000</span><h3>context words</h3></div><div class="card"><span class="metric">1,000,000</span><h3>matrix cells</h3></div></div></div>`;
    if (scene === "load") return `<div class="scene"><h2>Read the corpus as one token stream</h2><p><code>wsjoneline.txt</code> contains tokenized Wall Street Journal text. No linguistic annotation is needed: distributional learning uses neighboring words.</p><div class="cards"><div class="card active"><span class="metric">1,173,766</span><h3>tokens</h3></div><div class="card"><span class="metric">43,766</span><h3>distinct types</h3></div><div class="card"><span class="metric">6.4 MB</span><h3>plain text</h3></div></div></div>`;
    if (scene === "tokens") return `<div class="scene"><h2>Split and lowercase</h2><p>Lowercasing lets <em>Computer</em> and <em>computer</em> contribute to the same representation.</p><div class="sentence"><div class="word-token"><strong>The</strong><span>input</span></div><div class="word-token"><strong>survival</strong><span>input</span></div><div class="word-token"><strong>of</strong><span>input</span></div><span class="times">→</span><div class="word-token context"><strong>the</strong><span>token</span></div><div class="word-token context"><strong>survival</strong><span>token</span></div><div class="word-token context"><strong>of</strong><span>token</span></div></div></div>`;
    if (scene === "counts-empty") return `<div class="scene"><h2>Begin an empty frequency dictionary</h2><p>Each key will be a word type; its value will record how many corpus tokens have that spelling.</p><div class="dictionary">{ }</div></div>`;
    if (scene === "counts-loop") return `<div class="scene"><h2>Visit every token</h2><p>The loop sees 1,173,766 token occurrences one at a time. Repeated spellings update the same dictionary entry.</p><div class="pipeline"><span class="step on">the</span><span class="step">survival</span><span class="step">of</span><span class="step">spinoff</span><span class="step">cray</span><span class="step">computer</span><span class="step">…</span></div></div>`;
    if (scene === "counts-add") return `<div class="scene"><h2>Increment one count</h2><p><code>get(word, 0)</code> returns zero for a new word and the current count for a familiar one.</p><div class="dict-wrap"><div class="dictionary"><div>{</div><div class="dict-row"><span>&nbsp;&nbsp;"computer":</span><span>488,</span></div><div>}</div></div><span class="times">+ 1 →</span><div class="dictionary"><div>{</div><div class="dict-row new"><span>&nbsp;&nbsp;"computer":</span><span>489,</span></div><div>}</div></div></div></div>`;
    if (scene === "counts-sort") return `<div class="scene"><h2>Sort types by frequency</h2><p>The most common types move to the front. Punctuation is tokenized too, so commas and periods legitimately occupy vocabulary positions.</p>${countCards()}</div>`;
    if (scene === "vocabulary") return `<div class="scene"><h2>Slice off the first 1,000 words</h2><p>The vocabulary includes frequent function words, content words, punctuation, and numbers. Everything else becomes out of vocabulary for this demonstration.</p><div class="pipeline"><span class="step on">,</span><span class="step on">the</span><span class="step on">.</span><span class="step on">of</span><span class="step">…</span><span class="step on">word #1,000</span><span class="arrow">|</span><span class="step">discard rarer types</span></div></div>`;
    if (scene === "indices") return `<div class="scene"><h2>Give every vocabulary word a row number</h2><p>The dictionary translates human-readable words into integer matrix coordinates.</p><div class="dictionary"><div>{</div><div class="dict-row"><span>&nbsp;&nbsp;"computer":</span><span>237,</span></div><div class="dict-row"><span>&nbsp;&nbsp;"sold":</span><span>243,</span></div><div class="dict-row"><span>&nbsp;&nbsp;"workers":</span><span>463,</span></div><div class="dict-row"><span>&nbsp;&nbsp;"employees":</span><span>478,</span></div><div class="dict-row"><span>&nbsp;&nbsp;"equipment":</span><span>576,</span></div><div class="dict-row"><span>&nbsp;&nbsp;"bought":</span><span>726</span></div><div>}</div></div></div>`;
    if (scene === "window") return `<div class="scene"><h2>Look three words in each direction</h2><p>The center word itself is excluded. Each center word may therefore contribute as many as six center–context pairs.</p>${tokenStrip("context-loop")}<div class="pipeline"><span class="step">3 left contexts</span><span class="arrow">←</span><span class="step on">equipment</span><span class="arrow">→</span><span class="step">3 right contexts</span></div></div>`;
    if (scene === "empty-matrix") return `<div class="scene"><h2>Start with a million zeros</h2><p>Rows represent center words and columns represent context words. A cell will count how often its two words occur within the chosen window.</p><div class="factorization"><div class="matrix-block wide">fij<br>1,000 × 1,000<br><small>all cells = 0</small></div></div></div>`;
    if (scene === "target-loop") return `<div class="scene"><h2>Choose each corpus token as a center word</h2><p>We pause at one real occurrence of <em>equipment</em>. Its corpus position is <code>i</code>.</p>${tokenStrip("target-loop")}</div>`;
    if (scene === "target-filter") return `<div class="scene"><h2>Skip center words outside the vocabulary</h2><p><em>equipment</em> is vocabulary item 576, so this occurrence remains. A rarer center word would contribute no matrix row.</p>${tokenStrip("target-loop")}<div class="explain-box"><strong>equipment ∈ vocabulary</strong><br>Continue into the context loop.</div></div>`;
    if (scene === "context-loop") return `<div class="scene"><h2>Visit nearby context positions</h2><p><code>j</code> moves from <code>i − 3</code> through <code>i + 3</code>. The highlighted words fall inside that window.</p>${tokenStrip("context-loop")}</div>`;
    if (scene === "context-filter") return `<div class="scene"><h2>Keep valid vocabulary contexts</h2><p>The code skips the center word itself, positions beyond the corpus boundaries, and words outside the 1,000-word vocabulary.</p>${tokenStrip("context-filter")}<div class="explain-box"><strong>One subtle point</strong><br>Rare context words do not receive columns, even when they occur inside the window.</div></div>`;
    if (scene === "increment") return `<div class="scene"><h2>Add one to a center–context cell</h2><p>After the complete sweep, the matrix records patterns such as <em>bought</em> occurring near <em>sold</em> twelve times.</p>${matrixTable(COUNT_MATRIX)}<p class="small">A six-word excerpt of the full 1,000 × 1,000 matrix.</p></div>`;
    if (["row-sums", "column-sums", "total", "joint", "target-probability", "context-probability"].includes(scene)) return probabilityScene(scene);
    if (scene === "expected") return `<div class="scene"><h2>Compute chance co-occurrence</h2><p>If center words and contexts were independent, their joint probability would be the product of their marginal probabilities.</p><div class="formula-card">expected(bought, sold)<br>= p(bought, *) × p(*, sold)<br>= (864 / 3,849,232) × (2,313 / 3,849,232)<br><strong>= 1.35 × 10⁻⁷</strong></div></div>`;
    if (scene === "ratio") return `<div class="scene"><h2>Compare observed with expected</h2><p><em>bought</em> and <em>sold</em> occur together far more often than independence predicts.</p><div class="formula-card">observed / expected<br>= (12 / 3,849,232) / 1.35 × 10⁻⁷<br><strong>= 23.11 times more often than chance</strong></div><p class="small">Zero-count cells are assigned a neutral ratio of 1 so that their final PPMI value is zero.</p></div>`;
    if (scene === "safe-divide") return `<div class="scene"><h2>Give zero-count cells a safe default</h2><p><code>np.ones_like(pij)</code> creates another 1,000 × 1,000 array with the same shape and data type as <code>pij</code>, but filled with ones. It becomes the output array for the division.</p><div class="dict-wrap"><div><h3>Observed count exists</h3><div class="formula-card">where = True<br>ratio = pij / expected</div></div><div><h3>Observed count is zero</h3><div class="formula-card">where = False<br>ratio keeps its initial value: 1<br>log₂(1) = 0</div></div></div><div class="explain-box"><strong>This is not add-one smoothing.</strong><br>No corpus count changes. The ones only supply a convenient output value wherever division is skipped.</div></div>`;
    if (scene === "ppmi") return `<div class="scene"><h2>Take the log and discard negative values</h2><p>The logarithm compresses large ratios. Positive PMI keeps associations stronger than chance; negative values become zero.</p><div class="formula-card">PPMI(bought, sold) = max(log₂(23.11), 0) = <strong>4.53</strong></div>${matrixTable(PPMI_MATRIX, true)}<p class="small">This example uses no smoothing.</p></div>`;
    if (scene === "svd") return `<div class="scene"><h2>Factor the PPMI matrix</h2><p>SVD rewrites one matrix as three coordinated matrices. The largest singular values identify the strongest recurring patterns.</p>${svdBlocks(false)}<p class="small">Multiplying UΣVᵀ reconstructs the original PPMI matrix, apart from numerical rounding.</p></div>`;
    if (scene === "truncate") return `<div class="scene"><h2>Keep only 50 latent dimensions</h2><p>The first 50 dimensions preserve the strongest patterns and discard many corpus-specific details. Each word is now represented by one compact row.</p>${svdBlocks(true)}<div class="pipeline"><span class="step">1,000 PPMI features</span><span class="arrow">→</span><span class="step on">50 latent features</span></div></div>`;
    if (scene === "cosine-import") return `<div class="scene"><h2>Compare directions, not lengths</h2><p>Cosine similarity is high when two embedding vectors point in similar directions. Words can therefore be close even when their raw frequencies differ.</p><div class="formula-card">cosine(a, b) = (a · b) / (||a|| ||b||)<br><strong>range: −1 to 1</strong></div></div>`;
    if (scene === "similar-function") return `<div class="scene"><h2>Define a nearest-neighbor search</h2><p>The function will compare one query vector with every vocabulary vector, then rank words by cosine similarity.</p><div class="pipeline"><span class="step on">query word</span><span class="arrow">→</span><span class="step">query vector</span><span class="arrow">→</span><span class="step">1,000 cosine scores</span><span class="arrow">→</span><span class="step">ranked words</span></div></div>`;
    if (scene === "similar-empty") return `<div class="scene"><h2>Prepare a score dictionary</h2><p>Each key will be a candidate word and each value will be its cosine similarity to the query.</p><div class="dictionary">{ }</div></div>`;
    if (scene === "similar-index") return `<div class="scene"><h2>Find the query row</h2><p><em>equipment</em> maps to row 576. <code>matrix[576]</code> is its 50-dimensional embedding.</p><div class="factorization"><div class="matrix-block wide">TM[576]<br>[0.31, −0.08, …]<br><small>50 numbers</small></div></div></div>`;
    if (scene === "similar-loop") return `<div class="scene"><h2>Compare every candidate</h2><p>The loop retrieves one candidate row at a time: <em>computer</em>, <em>machines</em>, <em>systems</em>, and all other vocabulary words.</p><div class="pipeline"><span class="step on">equipment</span><span class="arrow">vs.</span><span class="step">computer</span><span class="step">machines</span><span class="step">computers</span><span class="step">…</span></div></div>`;
    if (scene === "cosine") return `<div class="scene"><h2>Measure each angle</h2><p>The vectors for <em>equipment</em> and <em>computer</em> point in similar directions because the words occur in similar contexts.</p><div class="formula-card">cosine(equipment, computer) = <strong>0.808</strong></div>${neighborBars()}</div>`;
    if (scene === "reshape-query") return `<div class="scene"><h2>Turn one vector into a one-row matrix</h2><p><code>matrix[firstidx]</code> has shape <code>(50,)</code>: one flat vector containing 50 features. Scikit-learn expects a two-dimensional collection of examples, even when we supply only one.</p><div class="factorization"><div class="matrix-block wide">before reshape<br>(50,)<br><small>one flat vector</small></div><span class="times">→</span><div class="matrix-block wide green">after reshape<br>(1, 50)<br><small>one row × 50 features</small></div></div><div class="explain-box"><strong>Why −1?</strong><br>In <code>reshape(1, −1)</code>, the 1 fixes the number of rows. NumPy infers that the remaining dimension must be 50.</div></div>`;
    if (scene === "reshape-candidate") return `<div class="scene"><h2>Reshape the candidate in the same way</h2><p>The candidate embedding also changes from shape <code>(50,)</code> to <code>(1, 50)</code>. Cosine similarity now receives two matrices containing one example each.</p><div class="factorization"><div class="matrix-block">query<br>1 × 50</div><span class="times">vs.</span><div class="matrix-block gold">candidate<br>1 × 50</div><span class="times">→</span><div class="matrix-block green">similarities<br>1 × 1</div></div></div>`;
    if (scene === "cosine-result") return `<div class="scene"><h2>Extract the single similarity value</h2><p>Because each input contains one row, <code>cossim</code> returns a 1 × 1 matrix. The first <code>[0]</code> selects its only row; the second selects the only value in that row.</p><div class="formula-card">cossim(...) = [[0.808]]<br>cossim(...)[0][0] = <strong>0.808</strong></div></div>`;
    if (scene === "sort-neighbors") return `<div class="scene"><h2>Sort from most similar to least similar</h2><p>The query word itself receives cosine 1.0 and appears first, so the final example slices it away with <code>[1:6]</code>.</p><div class="pipeline"><span class="step on">equipment 1.000</span><span class="arrow">→</span><span class="step">computer 0.808</span><span class="arrow">→</span><span class="step">machines 0.806</span><span class="arrow">→</span><span class="step">…</span></div></div>`;
    if (scene === "neighbors") return `<div class="scene"><h2>Inspect the learned neighborhood</h2><p>No one told the model that these words are related. Their similarity emerged from patterns of neighboring words in the corpus.</p>${neighborBars()}<div class="explain-box"><strong>Distributional hypothesis</strong><br>Words that occur in similar contexts tend to have related meanings.</div></div>`;
    return `<div class="scene"><h2>Counts become vectors</h2><p>Move through the code to follow the complete transformation.</p></div>`;
  }

  function sceneHeading(scene) {
    if (["import", "vocab-size", "load", "tokens"].includes(scene)) return ["Corpus", "Read and tokenize the text"];
    if (scene.startsWith("counts") || ["vocabulary", "indices"].includes(scene)) return ["Vocabulary", "Count and index frequent words"];
    if (["window", "empty-matrix", "target-loop", "target-filter", "context-loop", "context-filter", "increment"].includes(scene)) return ["Co-occurrence", "Build the word–context matrix"];
    if (["row-sums", "column-sums", "total", "joint", "target-probability", "context-probability", "expected", "ratio", "safe-divide", "ppmi"].includes(scene)) return ["PPMI", "Compare observed and expected counts"];
    if (["svd", "truncate"].includes(scene)) return ["SVD", "Compress the PPMI matrix"];
    return ["Similarity", "Find neighbors in embedding space"];
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
      codeWindow.scrollTop = activeTop - codeWindow.clientHeight / 2 + active.clientHeight / 2;
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

  global.PpmiSvdDemo = {
    CODE_LINES,
    COUNT_MATRIX,
    PPMI_MATRIX,
    ppmiValue,
    buildCooccurrence,
    renderScene,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.PpmiSvdDemo;
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", initialize);
}(globalThis));
