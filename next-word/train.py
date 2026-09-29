#!/usr/bin/env python3
"""Train a compact feedforward next-word model and export it for the browser."""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import time
from collections import Counter
from pathlib import Path

import torch
from torch import nn


TOKEN_PATTERN = re.compile(r"<unk>|\w+(?:['’]\w+)*|[^\w\s]", re.UNICODE)
SPECIAL_TOKENS = ("<unk>", "<eos>")


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for line in text.lower().splitlines():
        line = line.replace("@-@", "-").replace("@,@", ",").replace("@.@", ".")
        line_tokens = TOKEN_PATTERN.findall(line)
        if line_tokens:
            tokens.extend(line_tokens)
            tokens.append("<eos>")
    return tokens


def load_tokens(path: Path, maximum: int | None = None) -> list[str]:
    tokens = tokenize(path.read_text(encoding="utf-8"))
    return tokens[:maximum] if maximum else tokens


def build_vocabulary(tokens: list[str], vocabulary_size: int) -> tuple[list[str], dict[str, int]]:
    counts = Counter(tokens)
    for token in SPECIAL_TOKENS:
        counts.pop(token, None)
    vocabulary = list(SPECIAL_TOKENS)
    vocabulary.extend(token for token, _ in counts.most_common(vocabulary_size - len(vocabulary)))
    return vocabulary, {token: index for index, token in enumerate(vocabulary)}


def encode(tokens: list[str], token_to_id: dict[str, int]) -> torch.Tensor:
    unknown = token_to_id["<unk>"]
    return torch.tensor([token_to_id.get(token, unknown) for token in tokens], dtype=torch.long)


class FeedForwardLanguageModel(nn.Module):
    def __init__(
        self,
        vocabulary_size: int,
        context_size: int,
        embedding_size: int,
        hidden_size: int,
    ) -> None:
        super().__init__()
        self.context_size = context_size
        self.embedding = nn.Embedding(vocabulary_size, embedding_size)
        self.hidden = nn.Linear(context_size * embedding_size, hidden_size)
        self.output = nn.Linear(hidden_size, vocabulary_size)

    def forward(self, contexts: torch.Tensor) -> torch.Tensor:
        embedded = self.embedding(contexts)
        flattened = embedded.reshape(embedded.shape[0], -1)
        hidden = torch.tanh(self.hidden(flattened))
        return self.output(hidden)


def choose_device(requested: str) -> torch.device:
    if requested != "auto":
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def batches(token_ids: torch.Tensor, context_size: int, batch_size: int, shuffle: bool):
    windows = token_ids.unfold(0, context_size + 1, 1)
    order = torch.randperm(len(windows), device=token_ids.device) if shuffle else None
    for start in range(0, len(windows), batch_size):
        selected = windows[start : start + batch_size] if order is None else windows[order[start : start + batch_size]]
        yield selected[:, :-1], selected[:, -1]


@torch.no_grad()
def evaluate(
    model: nn.Module,
    token_ids: torch.Tensor,
    context_size: int,
    batch_size: int,
) -> float:
    model.eval()
    total_loss = torch.zeros((), device=token_ids.device)
    total_examples = 0
    for contexts, targets in batches(token_ids, context_size, batch_size, shuffle=False):
        loss = nn.functional.cross_entropy(model(contexts), targets, reduction="sum")
        total_loss += loss
        total_examples += len(targets)
    return total_loss.item() / total_examples


def save_checkpoint(
    path: Path,
    model: nn.Module,
    vocabulary: list[str],
    config: dict[str, int | float | str],
    epoch: int,
    validation_loss: float,
) -> None:
    torch.save(
        {
            "model_state": {name: value.detach().cpu() for name, value in model.state_dict().items()},
            "vocabulary": vocabulary,
            "config": config,
            "epoch": epoch,
            "validation_loss": validation_loss,
        },
        path,
    )


def export_browser_model(checkpoint_path: Path, output_directory: Path) -> None:
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    state = checkpoint["model_state"]
    arrays = []
    offset = 0
    binary_path = output_directory / "model.bin"
    with binary_path.open("wb") as target:
        for name in ("embedding.weight", "hidden.weight", "hidden.bias", "output.weight", "output.bias"):
            tensor = state[name].contiguous().float()
            values = tensor.numpy().astype("<f4", copy=False).ravel()
            raw = values.tobytes(order="C")
            target.write(raw)
            arrays.append({"name": name, "shape": list(tensor.shape), "offset": offset, "length": len(values)})
            offset += len(raw)

    metadata = {
        "format": "ml-for-linguists-feedforward-lm-v1",
        "dtype": "float32-little-endian",
        "binary": binary_path.name,
        "vocabulary": checkpoint["vocabulary"],
        "config": checkpoint["config"],
        "epoch": checkpoint["epoch"],
        "validation_loss": checkpoint["validation_loss"],
        "validation_perplexity": math.exp(min(checkpoint["validation_loss"], 20)),
        "arrays": arrays,
    }
    (output_directory / "model.json").write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("data/wikitext-2"))
    parser.add_argument("--output-dir", type=Path, default=Path("output"))
    parser.add_argument("--vocabulary-size", type=int, default=8000)
    parser.add_argument("--context-size", type=int, default=4)
    parser.add_argument("--embedding-size", type=int, default=64)
    parser.add_argument("--hidden-size", type=int, default=128)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.001)
    parser.add_argument(
        "--patience",
        type=int,
        default=2,
        help="Stop after this many epochs without improvement; 0 disables early stopping",
    )
    parser.add_argument("--max-training-tokens", type=int)
    parser.add_argument("--max-validation-tokens", type=int)
    parser.add_argument("--device", default="auto", help="auto, cpu, mps, cuda, or a device such as cuda:0")
    parser.add_argument("--seed", type=int, default=3370)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = choose_device(args.device)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    training_tokens = load_tokens(args.data_dir / "wiki.train.tokens", args.max_training_tokens)
    validation_tokens = load_tokens(args.data_dir / "wiki.valid.tokens", args.max_validation_tokens)
    vocabulary, token_to_id = build_vocabulary(training_tokens, args.vocabulary_size)
    training_ids = encode(training_tokens, token_to_id).to(device)
    validation_ids = encode(validation_tokens, token_to_id).to(device)

    config = {
        "vocabulary_size": len(vocabulary),
        "context_size": args.context_size,
        "embedding_size": args.embedding_size,
        "hidden_size": args.hidden_size,
        "tokenizer": "lowercase words and punctuation; <eos> after each nonempty line",
    }
    model = FeedForwardLanguageModel(
        len(vocabulary), args.context_size, args.embedding_size, args.hidden_size
    ).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    parameter_count = sum(parameter.numel() for parameter in model.parameters())

    print(f"device: {device}")
    print(f"training tokens: {len(training_ids):,}")
    print(f"validation tokens: {len(validation_ids):,}")
    print(f"vocabulary: {len(vocabulary):,}")
    print(f"parameters: {parameter_count:,}")

    best_loss = math.inf
    epochs_without_improvement = 0
    checkpoint_path = args.output_dir / "model.pt"
    for epoch in range(1, args.epochs + 1):
        model.train()
        epoch_start = time.perf_counter()
        total_loss = torch.zeros((), device=device)
        total_examples = 0
        for contexts, targets in batches(training_ids, args.context_size, args.batch_size, shuffle=True):
            optimizer.zero_grad(set_to_none=True)
            loss = nn.functional.cross_entropy(model(contexts), targets)
            loss.backward()
            optimizer.step()
            total_loss += loss.detach() * len(targets)
            total_examples += len(targets)

        training_loss = total_loss.item() / total_examples
        validation_loss = evaluate(model, validation_ids, args.context_size, args.batch_size)
        elapsed = time.perf_counter() - epoch_start
        print(
            f"epoch {epoch:>2}: train loss {training_loss:.4f}, "
            f"validation loss {validation_loss:.4f}, "
            f"perplexity {math.exp(min(validation_loss, 20)):.1f}, {elapsed:.1f}s"
        )
        if validation_loss < best_loss:
            best_loss = validation_loss
            epochs_without_improvement = 0
            save_checkpoint(checkpoint_path, model, vocabulary, config, epoch, validation_loss)
        else:
            epochs_without_improvement += 1
            if args.patience and epochs_without_improvement >= args.patience:
                print(f"stopping early after {args.patience} epochs without improvement")
                break

    export_browser_model(checkpoint_path, args.output_dir)
    print(f"saved checkpoint: {checkpoint_path}")
    print(f"saved browser model: {args.output_dir / 'model.json'} and {args.output_dir / 'model.bin'}")


if __name__ == "__main__":
    main()
