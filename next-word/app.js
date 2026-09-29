(function (global) {
  "use strict";

  const TOKEN_PATTERN = /<unk>|[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*|[^\p{L}\p{N}_\s]/gu;

  function tokenize(text) {
    const normalized = text
      .toLowerCase()
      .replaceAll("@-@", "-")
      .replaceAll("@,@", ",")
      .replaceAll("@.@", ".");
    return normalized.match(TOKEN_PATTERN) || [];
  }

  class NextWordModel {
    constructor(metadata, binary) {
      this.metadata = metadata;
      this.vocabulary = metadata.vocabulary;
      this.tokenToId = new Map(this.vocabulary.map((token, index) => [token, index]));
      this.contextSize = metadata.config.context_size;
      this.embeddingSize = metadata.config.embedding_size;
      this.hiddenSize = metadata.config.hidden_size;
      this.unknownId = this.tokenToId.get("<unk>");
      this.endId = this.tokenToId.get("<eos>");
      this.arrays = new Map();

      for (const item of metadata.arrays) {
        this.arrays.set(
          item.name,
          new Float32Array(binary, item.offset, item.length),
        );
      }
    }

    contextFor(text) {
      const tokens = tokenize(text);
      const padding = Array(this.contextSize).fill("<eos>");
      return padding.concat(tokens).slice(-this.contextSize);
    }

    predict(text, resultCount = 12) {
      const context = this.contextFor(text);
      const contextIds = context.map((token) => this.tokenToId.get(token) ?? this.unknownId);
      const embeddings = this.arrays.get("embedding.weight");
      const hiddenWeights = this.arrays.get("hidden.weight");
      const hiddenBias = this.arrays.get("hidden.bias");
      const outputWeights = this.arrays.get("output.weight");
      const outputBias = this.arrays.get("output.bias");
      const flattenedSize = this.contextSize * this.embeddingSize;
      const flattened = new Float32Array(flattenedSize);

      for (let position = 0; position < this.contextSize; position += 1) {
        const source = contextIds[position] * this.embeddingSize;
        const target = position * this.embeddingSize;
        for (let dimension = 0; dimension < this.embeddingSize; dimension += 1) {
          flattened[target + dimension] = embeddings[source + dimension];
        }
      }

      const hidden = new Float32Array(this.hiddenSize);
      for (let unit = 0; unit < this.hiddenSize; unit += 1) {
        let score = hiddenBias[unit];
        const row = unit * flattenedSize;
        for (let feature = 0; feature < flattenedSize; feature += 1) {
          score += hiddenWeights[row + feature] * flattened[feature];
        }
        hidden[unit] = Math.tanh(score);
      }

      const logits = new Float32Array(this.vocabulary.length);
      let maximum = -Infinity;
      for (let token = 0; token < this.vocabulary.length; token += 1) {
        let score = outputBias[token];
        const row = token * this.hiddenSize;
        for (let unit = 0; unit < this.hiddenSize; unit += 1) {
          score += outputWeights[row + unit] * hidden[unit];
        }
        logits[token] = score;
        maximum = Math.max(maximum, score);
      }

      const probabilities = new Float32Array(this.vocabulary.length);
      let total = 0;
      for (let token = 0; token < logits.length; token += 1) {
        const probability = Math.exp(logits[token] - maximum);
        probabilities[token] = probability;
        total += probability;
      }
      for (let token = 0; token < probabilities.length; token += 1) {
        probabilities[token] /= total;
      }

      const indices = Array.from(probabilities.keys());
      indices.sort((left, right) => probabilities[right] - probabilities[left]);
      const predictions = indices.slice(0, resultCount).map((index) => ({
        token: this.vocabulary[index],
        probability: probabilities[index],
      }));
      return { context, contextIds, predictions };
    }

    nearestNeighbors(word, resultCount = 10) {
      const token = tokenize(word)[0] || "";
      const wordId = this.tokenToId.get(token);
      if (wordId === undefined || token.startsWith("<")) {
        return { token, neighbors: [] };
      }

      const embeddings = this.arrays.get("embedding.weight");
      const sourceOffset = wordId * this.embeddingSize;
      let sourceNorm = 0;
      for (let dimension = 0; dimension < this.embeddingSize; dimension += 1) {
        const value = embeddings[sourceOffset + dimension];
        sourceNorm += value * value;
      }
      sourceNorm = Math.sqrt(sourceNorm);

      const scored = [];
      for (let candidate = 0; candidate < this.vocabulary.length; candidate += 1) {
        if (candidate === wordId || this.vocabulary[candidate].startsWith("<")) continue;
        const candidateOffset = candidate * this.embeddingSize;
        let dot = 0;
        let candidateNorm = 0;
        for (let dimension = 0; dimension < this.embeddingSize; dimension += 1) {
          const sourceValue = embeddings[sourceOffset + dimension];
          const candidateValue = embeddings[candidateOffset + dimension];
          dot += sourceValue * candidateValue;
          candidateNorm += candidateValue * candidateValue;
        }
        scored.push({
          token: this.vocabulary[candidate],
          similarity: dot / Math.max(sourceNorm * Math.sqrt(candidateNorm), 1e-12),
        });
      }
      scored.sort((left, right) => right.similarity - left.similarity);
      return { token, neighbors: scored.slice(0, resultCount) };
    }
  }

  async function loadModel(metadataUrl) {
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) throw new Error(`Could not load ${metadataUrl}`);
    const metadata = await metadataResponse.json();
    const binaryUrl = new URL(metadata.binary, metadataResponse.url);
    const binaryResponse = await fetch(binaryUrl);
    if (!binaryResponse.ok) throw new Error(`Could not load ${binaryUrl}`);
    return new NextWordModel(metadata, await binaryResponse.arrayBuffer());
  }

  function formatToken(token) {
    if (token === "<unk>") return "unknown / rare word";
    if (token === "<eos>") return "end of passage";
    return token;
  }

  function initializeInterface() {
    const input = document.querySelector("#text-input");
    const status = document.querySelector("#status");
    const predictions = document.querySelector("#predictions");
    const contextTokens = document.querySelector("#context-tokens");
    const tokenNote = document.querySelector("#token-note");
    const topMass = document.querySelector("#top-mass");
    const embeddingForm = document.querySelector("#embedding-form");
    const embeddingWord = document.querySelector("#embedding-word");
    const embeddingStatus = document.querySelector("#embedding-status");
    const neighborList = document.querySelector("#neighbor-list");
    let model = null;

    function renderPrediction() {
      if (!model) return;
      const result = model.predict(input.value);
      const maximum = result.predictions[0]?.probability || 1;
      const visibleMass = result.predictions.reduce((sum, item) => sum + item.probability, 0);
      predictions.replaceChildren();

      for (const item of result.predictions) {
        const row = document.createElement("div");
        const label = document.createElement("div");
        const word = document.createElement("span");
        const probability = document.createElement("span");
        const track = document.createElement("div");
        const fill = document.createElement("div");
        row.className = "prediction-row";
        label.className = "prediction-label";
        word.className = "prediction-word";
        probability.className = "prediction-probability";
        track.className = "bar-track";
        fill.className = "bar-fill";
        word.textContent = formatToken(item.token);
        probability.textContent = `${(item.probability * 100).toFixed(1)}%`;
        fill.style.width = `${(item.probability / maximum) * 100}%`;
        label.append(word, probability);
        track.append(fill);
        row.append(label, track);
        predictions.append(row);
      }

      contextTokens.replaceChildren();
      let unknownCount = 0;
      result.context.forEach((token, position) => {
        const button = document.createElement("button");
        const known = model.tokenToId.has(token);
        button.type = "button";
        button.className = `context-token${known ? "" : " unknown"}`;
        button.textContent = known ? token : `${token} → <unk>`;
        button.title = "Explore this token's embedding";
        button.addEventListener("click", () => {
          embeddingWord.value = known ? token : "";
          embeddingForm.requestSubmit();
        });
        contextTokens.append(button);
        if (!known) unknownCount += 1;
        if (position === result.context.length - 1) button.setAttribute("aria-label", `${button.textContent}, most recent token`);
      });
      tokenNote.textContent = unknownCount
        ? `${unknownCount} context token${unknownCount === 1 ? " is" : "s are"} outside the vocabulary and become <unk>.`
        : "Earlier tokens do not affect this prediction. Click a token to explore its embedding.";
      topMass.textContent = `top 12: ${(visibleMass * 100).toFixed(1)}%`;
    }

    function renderNeighbors() {
      if (!model) return;
      const result = model.nearestNeighbors(embeddingWord.value);
      neighborList.replaceChildren();
      if (!result.neighbors.length) {
        embeddingStatus.textContent = result.token
          ? `“${result.token}” is not in this model's vocabulary.`
          : "Enter one vocabulary word.";
        return;
      }
      embeddingStatus.textContent = `Nearest vectors to “${result.token}” by cosine similarity:`;
      for (const item of result.neighbors) {
        const neighbor = document.createElement("span");
        neighbor.className = "neighbor";
        neighbor.textContent = `${item.token}  ${item.similarity.toFixed(2)}`;
        neighborList.append(neighbor);
      }
    }

    document.querySelectorAll(".sample-button").forEach((button) => {
      button.addEventListener("click", () => {
        input.value = button.dataset.text;
        input.focus();
        renderPrediction();
      });
    });
    document.querySelector("#clear-button").addEventListener("click", () => {
      input.value = "";
      input.focus();
      renderPrediction();
    });
    input.addEventListener("input", renderPrediction);
    embeddingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      renderNeighbors();
    });

    loadModel("output/model.json")
      .then((loadedModel) => {
        model = loadedModel;
        input.disabled = false;
        status.textContent = "Model loaded. Predictions update with every token you type.";
        const config = model.metadata.config;
        document.querySelector("#model-facts").innerHTML = [
          `<span><strong>${config.context_size}</strong> context tokens</span>`,
          `<span><strong>${config.embedding_size}</strong>-number embeddings</span>`,
          `<span><strong>${config.hidden_size}</strong> hidden units</span>`,
          `<span><strong>${config.vocabulary_size.toLocaleString()}</strong> output tokens</span>`,
          `<span><strong>${model.metadata.validation_perplexity.toFixed(1)}</strong> validation perplexity</span>`,
        ].join("");
        renderPrediction();
        renderNeighbors();
      })
      .catch((error) => {
        status.classList.add("error");
        status.textContent = `${error.message}. Serve this directory over HTTP rather than opening index.html directly.`;
      });
  }

  global.NextWordDemo = { NextWordModel, tokenize };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NextWordDemo;
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", initializeInterface);
}(globalThis));
