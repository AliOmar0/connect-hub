import os
import json
import logging
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Config
MODEL_NAME = "aubmindlab/bert-base-arabertv02" # Baseline AraBERT
DATASET_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dataset", "nlp")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "intent_arabert")

# We must map string labels to ints
from scripts.generate_dataset import INTENTS
label2id = {label: i for i, label in enumerate(INTENTS)}
id2label = {i: label for label, i in label2id.items()}

def compute_metrics(pred):
    labels = pred.label_ids
    preds = pred.predictions.argmax(-1)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, preds, average='weighted', zero_division=0)
    acc = accuracy_score(labels, preds)
    return {
        'accuracy': acc,
        'f1': f1,
        'precision': precision,
        'recall': recall
    }

def train():
    if not os.path.exists(os.path.join(DATASET_DIR, "train.jsonl")):
        logger.error("Dataset not found. Run generate_dataset.py first.")
        return

    # Load dataset
    dataset = load_dataset('json', data_files={
        'train': os.path.join(DATASET_DIR, "train.jsonl"),
        'test': os.path.join(DATASET_DIR, "test.jsonl")
    })

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    def tokenize_function(examples):
        tokens = tokenizer(examples["text"], padding="max_length", truncation=True, max_length=128)
        tokens["label"] = [label2id[l] for l in examples["label"]]
        return tokens

    tokenized_datasets = dataset.map(tokenize_function, batched=True)

    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, 
        num_labels=len(INTENTS),
        id2label=id2label,
        label2id=label2id
    )

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        learning_rate=2e-5,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        num_train_epochs=3,
        weight_decay=0.01,
        load_best_model_at_end=True,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["test"],
        compute_metrics=compute_metrics,
    )

    logger.info("Starting training...")
    trainer.train()
    
    logger.info(f"Saving fine-tuned model to {OUTPUT_DIR}")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

if __name__ == "__main__":
    train()
