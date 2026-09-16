"use strict";

const DEFAULT_DATA = {
  concepts: [
    { number: 1, gloss: "I" },
    { number: 2, gloss: "you" },
    { number: 3, gloss: "he" },
    { number: 28, gloss: "long" },
    { number: 29, gloss: "wide" },
    { number: 30, gloss: "thick" },
    { number: 31, gloss: "heavy" },
    { number: 32, gloss: "small" },
    { number: 33, gloss: "short" },
    { number: 45, gloss: "fish" },
  ],
  languages: [
    { name: "Latin", words: ["ego", "tu", "is", "longus", "latus", "crassus", "gravis", "parvus", "brevis", "piscis"] },
    { name: "Spanish", words: ["yo", "tu", "el", "largo", "ancho", "grueso", "pesado", "pequeño", "corto", "pescado"] },
    { name: "Italian", words: ["io", "tu", "lui", "lungo", "largo", "spesso", "pesante", "piccolo", "corto", "pesce"] },
    { name: "Swedish", words: ["jag", "du", "han", "lång", "bred, vid", "tjock", "tung", "liten", "kort", "fisk"] },
    { name: "English", words: ["I", "you", "he", "long", "wide", "thick", "heavy", "small", "short", "fish"] },
    { name: "German", words: ["ich", "du", "er", "lang", "bret, weit", "dick", "schwer", "klein", "kurz", "Fisch"] },
    { name: "Finnish", words: ["minä", "sinä", "hän", "pitkä", "leveä", "paksu", "raskas", "pieni", "lyhyt", "kala"] },
    { name: "Estonian", words: ["mina", "sina", "tema", "pikk", "lai", "paks", "raske", "väike", "lühike", "kala"] },
  ],
};

function cloneData(data) {
  return {
    concepts: data.concepts.map((concept) => ({ ...concept })),
    languages: data.languages.map((language) => ({
      name: language.name,
      words: [...language.words],
    })),
  };
}

function letterSequences(word) {
  return word.toLocaleLowerCase().normalize("NFC").match(/\p{L}+/gu) || [];
}

function letterSet(word) {
  return new Set(letterSequences(word).flatMap((sequence) => Array.from(sequence)));
}

function bigramSet(word) {
  const bigrams = new Set();
  for (const sequence of letterSequences(word)) {
    const letters = Array.from(sequence);
    for (let index = 0; index < letters.length - 1; index += 1) {
      bigrams.add(letters[index] + letters[index + 1]);
    }
  }
  return bigrams;
}

function intersectionSize(left, right) {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function jaccard(left, right) {
  if (left.size === 0 || right.size === 0) return null;
  const intersection = intersectionSize(left, right);
  return intersection / (left.size + right.size - intersection);
}

const METRICS = {
  shared: {
    label: "shared distinct letters",
    note: "The textbook measure: count distinct letters appearing in both aligned words, then average the ten counts. Repeated letters count once.",
    digits: 2,
    score(leftWord, rightWord) {
      const left = letterSet(leftWord);
      const right = letterSet(rightWord);
      if (left.size === 0 || right.size === 0) return null;
      return intersectionSize(left, right);
    },
  },
  "letter-jaccard": {
    label: "letter-set Jaccard similarity",
    note: "Shared distinct letters divided by all distinct letters in either word. This ranges from 0 to 1 and reduces the advantage of long words.",
    digits: 3,
    score(leftWord, rightWord) {
      return jaccard(letterSet(leftWord), letterSet(rightWord));
    },
  },
  "bigram-jaccard": {
    label: "letter-bigram Jaccard similarity",
    note: "The overlap of adjacent letter pairs, divided by all bigrams in either word. Unlike the textbook measure, this pays attention to letter order.",
    digits: 3,
    score(leftWord, rightWord) {
      return jaccard(bigramSet(leftWord), bigramSet(rightWord));
    },
  },
};

function languageSimilarity(leftLanguage, rightLanguage, metric) {
  const scores = [];
  const rowCount = Math.min(leftLanguage.words.length, rightLanguage.words.length);
  for (let index = 0; index < rowCount; index += 1) {
    const score = metric.score(leftLanguage.words[index], rightLanguage.words[index]);
    if (score !== null && Number.isFinite(score)) scores.push(score);
  }
  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function similarityMatrix(data, metric) {
  return data.languages.map((language, row) =>
    data.languages.map((otherLanguage, column) => {
      if (row === column) return null;
      return languageSimilarity(language, otherLanguage, metric);
    })
  );
}

function averageLinkage(leftMembers, rightMembers, matrix) {
  let total = 0;
  let comparisons = 0;
  for (const left of leftMembers) {
    for (const right of rightMembers) {
      total += matrix[left][right];
      comparisons += 1;
    }
  }
  return comparisons === 0 ? 0 : total / comparisons;
}

function hierarchicalClustering(data, metric) {
  const matrix = similarityMatrix(data, metric);
  let clusters = data.languages.map((language, index) => ({
    id: `language-${index}`,
    name: language.name,
    members: [index],
    leafIndex: index,
    left: null,
    right: null,
    similarity: null,
    step: 0,
  }));
  const merges = [];

  while (clusters.length > 1) {
    let best = null;
    for (let left = 0; left < clusters.length; left += 1) {
      for (let right = left + 1; right < clusters.length; right += 1) {
        const similarity = averageLinkage(clusters[left].members, clusters[right].members, matrix);
        if (best === null || similarity > best.similarity + Number.EPSILON) {
          best = { left, right, similarity };
        }
      }
    }

    const leftCluster = clusters[best.left];
    const rightCluster = clusters[best.right];
    const merged = {
      id: `merge-${merges.length + 1}`,
      members: [...leftCluster.members, ...rightCluster.members].sort((a, b) => a - b),
      left: leftCluster,
      right: rightCluster,
      similarity: best.similarity,
      step: merges.length + 1,
    };
    merges.push(merged);
    clusters = clusters.filter((_, index) => index !== best.left && index !== best.right);
    clusters.push(merged);
  }

  return { matrix, merges, root: clusters[0] };
}

function clusterNames(cluster, data) {
  return cluster.members.map((index) => data.languages[index].name);
}

function shortClusterLabel(cluster, data) {
  const names = clusterNames(cluster, data);
  return names.length === 1 ? names[0] : `{${names.join(", ")}}`;
}

function orderedChildren(node) {
  if (!node.left) return [];
  return [node.left, node.right].sort((left, right) => left.members[0] - right.members[0]);
}

function treeLayout(root, maxSimilarity) {
  const leaves = [];
  function collectLeaves(node) {
    if (!node.left) {
      leaves.push(node);
      return;
    }
    for (const child of orderedChildren(node)) collectLeaves(child);
  }
  collectLeaves(root);

  const width = 900;
  const top = 42;
  const leafY = 382;
  const left = 76;
  const right = 24;
  const usableWidth = width - left - right;
  const xByLeaf = new Map(
    leaves.map((leaf, index) => [
      leaf.id,
      leaves.length === 1 ? left + usableWidth / 2 : left + (index * usableWidth) / (leaves.length - 1),
    ])
  );
  const safeMaximum = maxSimilarity > 0 ? maxSimilarity : 1;

  function place(node) {
    if (!node.left) return { ...node, x: xByLeaf.get(node.id), y: leafY };
    const [first, second] = orderedChildren(node).map(place);
    return {
      ...node,
      leftLayout: first,
      rightLayout: second,
      x: (first.x + second.x) / 2,
      y: top + (node.similarity / safeMaximum) * (leafY - top - 42),
    };
  }

  return { root: place(root), leaves, top, leafY, left, width, safeMaximum };
}

if (typeof module !== "undefined") {
  module.exports = {
    DEFAULT_DATA,
    METRICS,
    letterSet,
    bigramSet,
    languageSimilarity,
    similarityMatrix,
    hierarchicalClustering,
  };
}

if (typeof document !== "undefined") {
  const elements = {
    metric: document.querySelector("#metric"),
    metricNote: document.querySelector("#metric-note"),
    firstMerge: document.querySelector("#first-merge"),
    recluster: document.querySelector("#recluster"),
    reset: document.querySelector("#reset"),
    previous: document.querySelector("#previous"),
    play: document.querySelector("#play"),
    next: document.querySelector("#next"),
    step: document.querySelector("#step"),
    status: document.querySelector("#status"),
    tree: document.querySelector("#tree"),
    mergeList: document.querySelector("#merge-list"),
    matrix: document.querySelector("#matrix"),
    dataTable: document.querySelector("#data-table"),
  };

  const state = {
    data: cloneData(DEFAULT_DATA),
    result: null,
    step: 0,
    timer: null,
  };

  function svgElement(name, attributes = {}, text = "") {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text) element.textContent = text;
    return element;
  }

  function formatScore(score) {
    return score.toFixed(METRICS[elements.metric.value].digits);
  }

  function renderDataTable() {
    const table = document.createElement("table");
    table.className = "data-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["No.", "Concept", ...state.data.languages.map((language) => language.name)]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headRow.append(cell);
    }
    head.append(headRow);
    table.append(head);

    const body = document.createElement("tbody");
    state.data.concepts.forEach((concept, row) => {
      const tableRow = document.createElement("tr");
      const numberCell = document.createElement("td");
      numberCell.textContent = concept.number;
      tableRow.append(numberCell);
      const glossCell = document.createElement("td");
      glossCell.textContent = concept.gloss;
      tableRow.append(glossCell);

      state.data.languages.forEach((language, languageIndex) => {
        const cell = document.createElement("td");
        const input = document.createElement("input");
        input.value = language.words[row];
        input.dataset.language = languageIndex;
        input.dataset.row = row;
        input.setAttribute("aria-label", `${language.name}, ${concept.gloss}`);
        cell.append(input);
        tableRow.append(cell);
      });
      body.append(tableRow);
    });
    table.append(body);
    elements.dataTable.replaceChildren(table);
  }

  function collectEditedData() {
    const updated = cloneData(state.data);
    for (const input of elements.dataTable.querySelectorAll("input")) {
      updated.languages[Number(input.dataset.language)].words[Number(input.dataset.row)] = input.value.trim();
    }
    return updated;
  }

  function renderMatrix() {
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(document.createElement("th"));
    for (const language of state.data.languages) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = language.name;
      headRow.append(cell);
    }
    head.append(headRow);
    table.append(head);

    const values = state.result.matrix.flat().filter((value) => value !== null);
    const maximum = Math.max(...values, 1e-9);
    const body = document.createElement("tbody");
    state.result.matrix.forEach((row, rowIndex) => {
      const tableRow = document.createElement("tr");
      const heading = document.createElement("th");
      heading.scope = "row";
      heading.textContent = state.data.languages[rowIndex].name;
      tableRow.append(heading);
      row.forEach((score, columnIndex) => {
        const cell = document.createElement("td");
        cell.className = "matrix-cell";
        if (score === null) {
          cell.textContent = "—";
        } else {
          cell.textContent = formatScore(score);
          const alpha = 0.06 + 0.48 * (score / maximum);
          cell.style.background = `rgba(39, 93, 105, ${alpha})`;
          cell.title = `${state.data.languages[rowIndex].name} and ${state.data.languages[columnIndex].name}: ${formatScore(score)}`;
        }
        tableRow.append(cell);
      });
      body.append(tableRow);
    });
    table.append(body);
    elements.matrix.replaceChildren(table);
  }

  function renderMergeList() {
    elements.mergeList.replaceChildren();
    state.result.merges.forEach((merge) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      if (merge.step > state.step) button.classList.add("future");
      if (merge.step === state.step) button.classList.add("current");
      button.addEventListener("click", () => setStep(merge.step));

      const number = document.createElement("span");
      number.className = "merge-number";
      number.textContent = `${merge.step}.`;
      const names = document.createElement("span");
      names.textContent = `${shortClusterLabel(merge.left, state.data)} + ${shortClusterLabel(merge.right, state.data)}`;
      const score = document.createElement("span");
      score.className = "merge-score-list";
      score.textContent = formatScore(merge.similarity);
      button.append(number, names, score);
      item.append(button);
      elements.mergeList.append(item);
    });
  }

  function renderTree() {
    const values = state.result.matrix.flat().filter((value) => value !== null);
    const maximum = Math.max(...values, 1e-9);
    const layout = treeLayout(state.result.root, maximum);
    const preservedTitle = elements.tree.querySelector("title");
    const preservedDescription = elements.tree.querySelector("desc");
    elements.tree.replaceChildren(preservedTitle, preservedDescription);

    const tickCount = 4;
    for (let tick = 0; tick <= tickCount; tick += 1) {
      const score = (maximum * tick) / tickCount;
      const y = layout.top + (score / layout.safeMaximum) * (layout.leafY - layout.top - 42);
      elements.tree.append(svgElement("line", { x1: layout.left - 12, y1: y, x2: 882, y2: y, class: "axis-tick", opacity: tick === 0 ? 0.8 : 0.35 }));
      elements.tree.append(svgElement("text", { x: layout.left - 18, y: y + 4, "text-anchor": "end", class: "axis-label" }, formatScore(score)));
    }
    elements.tree.append(svgElement("text", { x: 14, y: 210, transform: "rotate(-90 14 210)", "text-anchor": "middle", class: "axis-title" }, "similarity at merge"));

    function draw(node) {
      if (!node.leftLayout) return;
      draw(node.leftLayout);
      draw(node.rightLayout);
      if (node.step > state.step) return;
      const current = node.step === state.step ? " current" : "";
      const path = [
        `M ${node.leftLayout.x} ${node.leftLayout.y}`,
        `V ${node.y}`,
        `H ${node.rightLayout.x}`,
        `V ${node.rightLayout.y}`,
      ].join(" ");
      elements.tree.append(svgElement("path", { d: path, class: `branch${current}` }));
      elements.tree.append(svgElement("circle", { cx: node.x, cy: node.y, r: node.step === state.step ? 5 : 3.5, class: `merge-dot${current}` }));
      elements.tree.append(svgElement("text", { x: node.x, y: node.y - 8, "text-anchor": "middle", class: "merge-score" }, formatScore(node.similarity)));
    }
    draw(layout.root);

    for (const leaf of layout.leaves) {
      const x = (() => {
        function find(node) {
          if (node.id === leaf.id) return node.x;
          if (!node.leftLayout) return null;
          return find(node.leftLayout) ?? find(node.rightLayout);
        }
        return find(layout.root);
      })();
      elements.tree.append(svgElement("circle", { cx: x, cy: layout.leafY, r: 3.5, class: "merge-dot" }));
      elements.tree.append(svgElement("text", { x, y: layout.leafY + 24, "text-anchor": "middle", class: "leaf-label" }, leaf.name));
    }
  }

  function renderStatus() {
    const metric = METRICS[elements.metric.value];
    elements.metricNote.textContent = metric.note;
    const first = state.result.merges[0];
    elements.firstMerge.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = "First result: ";
    elements.firstMerge.append(strong, `${shortClusterLabel(first.left, state.data)} and ${shortClusterLabel(first.right, state.data)} are closest at ${formatScore(first.similarity)} ${metric.label} per aligned row.`);

    if (state.step === 0) {
      elements.status.textContent = "No merges yet. Select Next or Play merges to begin with eight separate languages.";
    } else {
      const merge = state.result.merges[state.step - 1];
      elements.status.textContent = `Merge ${state.step} of ${state.result.merges.length}: ${shortClusterLabel(merge.left, state.data)} joins ${shortClusterLabel(merge.right, state.data)} at similarity ${formatScore(merge.similarity)}.`;
    }
    elements.previous.disabled = state.step === 0;
    elements.next.disabled = state.step === state.result.merges.length;
    if (state.timer === null) {
      elements.play.textContent = state.step === state.result.merges.length ? "Replay merges" : "Play merges";
    }
  }

  function renderStep() {
    elements.step.value = state.step;
    renderStatus();
    renderTree();
    renderMergeList();
  }

  function stopPlaying() {
    if (state.timer !== null) window.clearInterval(state.timer);
    state.timer = null;
    elements.play.textContent = "Play merges";
  }

  function setStep(step) {
    state.step = Math.max(0, Math.min(state.result.merges.length, Number(step)));
    if (state.step === state.result.merges.length) stopPlaying();
    renderStep();
  }

  function recluster({ keepStep = false } = {}) {
    stopPlaying();
    const metric = METRICS[elements.metric.value];
    state.result = hierarchicalClustering(state.data, metric);
    elements.step.max = state.result.merges.length;
    state.step = keepStep ? Math.min(state.step, state.result.merges.length) : 0;
    renderMatrix();
    renderStep();
  }

  elements.recluster.addEventListener("click", () => {
    state.data = collectEditedData();
    recluster();
  });
  elements.reset.addEventListener("click", () => {
    state.data = cloneData(DEFAULT_DATA);
    renderDataTable();
    recluster();
  });
  elements.metric.addEventListener("change", () => recluster({ keepStep: true }));
  elements.previous.addEventListener("click", () => setStep(state.step - 1));
  elements.next.addEventListener("click", () => setStep(state.step + 1));
  elements.step.addEventListener("input", (event) => {
    stopPlaying();
    setStep(event.target.value);
  });
  elements.play.addEventListener("click", () => {
    if (state.timer !== null) {
      stopPlaying();
      return;
    }
    if (state.step === state.result.merges.length) setStep(0);
    elements.play.textContent = "Pause";
    state.timer = window.setInterval(() => setStep(state.step + 1), 850);
  });

  renderDataTable();
  recluster();
  setStep(state.result.merges.length);
}
