#!/usr/bin/env python3
"""Inspect next-word predictions and learned embedding neighbors."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from torch.nn import functional as F

from train import FeedForwardLanguageModel, tokenize


def load_model(path: Path):
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    config = checkpoint["config"]
    vocabulary = checkpoint["vocabulary"]
    model = FeedForwardLanguageModel(
        config["vocabulary_size"],
        config["context_size"],
        config["embedding_size"],
        config["hidden_size"],
    )
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    return model, vocabulary


@torch.no_grad()
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("text", nargs="?", default="the meaning of the")
    parser.add_argument("--checkpoint", type=Path, default=Path("output/model.pt"))
    parser.add_argument("--top", type=int, default=12)
    parser.add_argument("--neighbors", help="Also show the nearest words to this word in embedding space")
    args = parser.parse_args()

    model, vocabulary = load_model(args.checkpoint)
    token_to_id = {token: index for index, token in enumerate(vocabulary)}
    unknown = token_to_id["<unk>"]
    tokens = tokenize(args.text)
    if tokens and tokens[-1] == "<eos>":
        tokens.pop()
    context_size = model.context_size
    context = (["<eos>"] * context_size + tokens)[-context_size:]
    context_ids = torch.tensor([[token_to_id.get(token, unknown) for token in context]])
    probabilities = F.softmax(model(context_ids), dim=1)[0]
    values, indices = probabilities.topk(args.top)

    print("context:", " ".join(context))
    for probability, index in zip(values.tolist(), indices.tolist()):
        print(f"{vocabulary[index]:>18}  {probability:7.3%}")

    if args.neighbors:
        if args.neighbors not in token_to_id:
            raise SystemExit(f"Not in vocabulary: {args.neighbors}")
        embeddings = F.normalize(model.embedding.weight, dim=1)
        word_id = token_to_id[args.neighbors]
        similarities = embeddings @ embeddings[word_id]
        values, indices = similarities.topk(args.top + 1)
        print(f"\nnearest embedding neighbors to {args.neighbors!r}:")
        for similarity, index in zip(values[1:].tolist(), indices[1:].tolist()):
            print(f"{vocabulary[index]:>18}  {similarity:7.3f}")


if __name__ == "__main__":
    main()
