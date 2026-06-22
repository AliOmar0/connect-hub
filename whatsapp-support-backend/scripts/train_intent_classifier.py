"""
Fine-tune an AraBERT / CAMeL-BERT intent classifier.

Trains a HuggingFace ``AutoModelForSequenceClassification`` on the generated
intent dataset (``app/dataset/nlp/intents_{train,val}.jsonl``) over the 15
canonical :class:`IntentLabel` classes, then saves a checkpoint that the
runtime :class:`TransformerIntentClassifier` can load via ``INTENT_MODEL_PATH``.

This is the production training path. It is intentionally separate from the
runtime so the service stays import-light (no torch/transformers needed unless
a checkpoint is configured).

Requirements (install on a training box / GPU):
    pip install "transformers>=4.38" "datasets>=2.16" "accelerate>=0.27" torch scikit-learn

Usage:
    python -m scripts.train_intent_classifier \
        --base aubmindlab/bert-base-arabertv2 \
        --epochs 5 --out ./models/intent-arabert

Recommended base models:
    - aubmindlab/bert-base-arabertv2            (AraBERT v2)
    - CAMeL-Lab/bert-base-arabic-camelbert-mix  (CAMeL-BERT, dialect-robust)

After training, point the service at the checkpoint:
    INTENT_MODEL_PATH=./models/intent-arabert
and re-run ``python -m scripts.eval_nlp`` to confirm >= 85% top-1 accuracy.
"""
from __future__ import annotations

import argparse
import json
import os
from typing import List

from app.models.nlp import IntentLabel

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "..", "app", "dataset", "nlp")


def _read_jsonl(path: str) -> List[dict]:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def main():
    parser = argparse.ArgumentParser(description="Fine-tune intent classifier")
    parser.add_argument("--base", default="aubmindlab/bert-base-arabertv2",
                        help="Base HF model (AraBERT / CAMeL-BERT)")
    parser.add_argument("--out", default="./models/intent-arabert",
                        help="Output checkpoint directory")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--max-len", type=int, default=128)
    args = parser.parse_args()

    # Local imports so the rest of the project doesn't require these heavy deps.
    import numpy as np
    import torch
    from datasets import Dataset
    from transformers import (
        AutoTokenizer,
        AutoModelForSequenceClassification,
        TrainingArguments,
        Trainer,
        DataCollatorWithPadding,
    )

    labels = IntentLabel.values()
    label2id = {l: i for i, l in enumerate(labels)}
    id2label = {i: l for l, i in label2id.items()}

    train_rows = _read_jsonl(os.path.join(DATA_DIR, "intents_train.jsonl"))
    val_rows = _read_jsonl(os.path.join(DATA_DIR, "intents_val.jsonl"))

    def to_ds(rows):
        return Dataset.from_dict({
            "text": [r["text"] for r in rows],
            "label": [label2id[r["intent"]] for r in rows],
        })

    train_ds, val_ds = to_ds(train_rows), to_ds(val_rows)

    tokenizer = AutoTokenizer.from_pretrained(args.base)

    def tok(batch):
        return tokenizer(batch["text"], truncation=True, max_length=args.max_len)

    train_ds = train_ds.map(tok, batched=True)
    val_ds = val_ds.map(tok, batched=True)

    model = AutoModelForSequenceClassification.from_pretrained(
        args.base,
        num_labels=len(labels),
        id2label=id2label,
        label2id=label2id,
    )

    def compute_metrics(eval_pred):
        from sklearn.metrics import accuracy_score, f1_score

        logits, gold = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {
            "accuracy": accuracy_score(gold, preds),
            "macro_f1": f1_score(gold, preds, average="macro"),
        }

    training_args = TrainingArguments(
        output_dir=os.path.join(args.out, "_checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        logging_steps=20,
        seed=20260622,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=compute_metrics,
    )

    trainer.train()
    metrics = trainer.evaluate()
    print("Validation metrics:", metrics)

    os.makedirs(args.out, exist_ok=True)
    trainer.save_model(args.out)
    tokenizer.save_pretrained(args.out)
    with open(os.path.join(args.out, "training_meta.json"), "w", encoding="utf-8") as f:
        json.dump({"base_model": args.base, "labels": labels, **metrics}, f, indent=2)
    print(f"Saved fine-tuned intent model to {args.out}")
    print("Set INTENT_MODEL_PATH to this path to activate it at runtime.")


if __name__ == "__main__":
    main()
