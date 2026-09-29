# Next-word model training

This directory trains a deliberately small, Bengio-style feedforward language model. The previous four tokens are represented by learned embeddings, concatenated, passed through one `tanh` hidden layer, and used to predict a probability distribution over the next token.

The architecture follows the central idea in Bengio, Ducharme, Vincent, and Jauvin's [“A Neural Probabilistic Language Model”](https://www.jmlr.org/papers/v3/bengio03a.html) (2003): learn continuous word representations jointly with a next-word probability function. The original formulation allowed optional direct connections from the word features to the output. This compact teaching model uses the simpler embedding–hidden-layer–softmax path illustrated in `bengio-model.svg`.

The data are WikiText-2, a roughly two-million-token collection of verified Wikipedia articles released by Salesforce Research. The download script retrieves the copy maintained in PyTorch's official examples repository, pins the source revision, and checks each file's SHA-256 checksum.

## Setup and smoke test

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python download_wikitext2.py
python train.py \
  --vocabulary-size 1000 \
  --embedding-size 16 \
  --hidden-size 32 \
  --batch-size 256 \
  --epochs 1 \
  --max-training-tokens 20000 \
  --max-validation-tokens 5000 \
  --output-dir output/smoke
python predict.py "the history of the" --checkpoint output/smoke/model.pt
```

## Full training

The defaults are the intended final model: an 8,000-token vocabulary, four-token context, 64-dimensional embeddings, 128 hidden units, and eight epochs. The script selects CUDA, Apple MPS, or CPU in that order.

```bash
python train.py --output-dir output/final
python predict.py "the history of the" \
  --checkpoint output/final/model.pt \
  --neighbors language
```

You can select a device explicitly with `--device mps`, `--device cuda`, or `--device cpu`. Run `python train.py --help` for all options.

The best validation checkpoint is saved rather than merely the final epoch. Training produces:

- `model.pt`: the complete PyTorch checkpoint;
- `model.json`: vocabulary, dimensions, validation score, and binary-array layout;
- `model.bin`: browser-ready, little-endian Float32 weights.

Copy all three files back after training. The eventual JavaScript demonstration will load `model.json` and `model.bin`; it will not require PyTorch.

## Browser demonstration

The trained model is too large to embed directly in the page, so the browser must load it over HTTP rather than through a `file:` URL:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. The page performs the embedding lookup, hidden-layer transformation, full 8,000-token output calculation, softmax, and embedding-neighbor search directly in JavaScript. It sends no text to a server.

Run the model-level JavaScript smoke test with:

```bash
node test.js
```

## Source

- Dataset: [WikiText-2](https://blog.salesforceairesearch.com/the-wikitext-long-term-dependency-language-modeling-dataset/)
- Training files: [PyTorch examples](https://github.com/pytorch/examples/tree/main/word_language_model/data/wikitext-2)
