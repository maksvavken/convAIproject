import os
import json
import shutil

import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv
from datasets import load_dataset

# =========================================================
# Load env
# =========================================================

load_dotenv(
    dotenv_path=os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        ".env"
    ),
    override=True
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# =========================================================
# Config
# =========================================================

DATASET_NAME = "datahiveai/recipes-with-nutrition"
MAX_RECIPES = 5000

DB_PATH = "./recipe_chroma_db"
COLLECTION_NAME = "recipes"

# =========================================================
# Embeddings
# =========================================================

emb_fn = embedding_functions.OpenAIEmbeddingFunction(
    api_key=OPENAI_API_KEY,
    model_name="text-embedding-3-small"
)

# =========================================================
# Helpers
# =========================================================

def safe_get(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return default


def coerce_list(value) -> list:
    """Ensure a value is a proper Python list of strings.

    HuggingFace datasets sometimes return list fields as a JSON string
    (e.g. '["item1", "item2"]') or as an already-parsed list. Both are
    handled here so the ingestion code can always call ', '.join(result).
    """
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return [str(v) for v in parsed]
            except json.JSONDecodeError:
                pass
        # Single plain string — wrap it
        return [stripped] if stripped else []
    return [str(value)]


def extract_macro_nutrients(total_nutrients: dict) -> dict:
    """Extract key nutrition values from the nested nutrient structure."""
    if not isinstance(total_nutrients, dict):
        return {}

    keys = {
        "ENERC_KCAL": "calories",
        "PROCNT":     "protein",
        "FAT":        "fat",
        "CHOCDF":     "carbs",
        "FIBTG":      "fiber",
        "SUGAR":      "sugar",
    }

    result = {}
    for k, label in keys.items():
        val = total_nutrients.get(k)
        if isinstance(val, dict):
            result[label] = round(float(val.get("quantity", 0)), 2)

    return result


def recipe_to_document(recipe: dict) -> str:
    """Convert a recipe dict into clean, embedding-friendly text."""

    name        = safe_get(recipe, "recipe_name", "Unknown recipe")
    calories    = safe_get(recipe, "calories", 0)
    diet_labels = coerce_list(safe_get(recipe, "diet_labels", []))
    cautions    = coerce_list(safe_get(recipe, "cautions", []))
    ingredients = coerce_list(safe_get(recipe, "ingredient_lines", []))
    nutrients   = extract_macro_nutrients(safe_get(recipe, "total_nutrients", {}))

    parts = []

    parts.append(f"Recipe: {name}.")
    parts.append(f"This recipe contains approximately {calories} calories per serving.")

    if diet_labels:
        parts.append("Diet labels: " + ", ".join(diet_labels) + ".")

    if cautions:
        parts.append("Cautions: " + ", ".join(cautions) + ".")

    if ingredients:
        parts.append("Ingredients: " + ", ".join(ingredients) + ".")

    if nutrients:
        macro_text = ", ".join(f"{k} {v}g" for k, v in nutrients.items())
        parts.append("Macronutrients: " + macro_text + ".")

    diet_str = ", ".join(diet_labels) if diet_labels else "general diets"
    parts.append(
        f"{name} is a dish containing {len(ingredients)} ingredients "
        f"and is suitable for {diet_str}."
    )

    return " ".join(parts)


def recipe_to_metadata(recipe: dict) -> dict:
    """Build small, filter-friendly metadata (all values must be str/int/float/bool)."""

    nutrients   = extract_macro_nutrients(safe_get(recipe, "total_nutrients", {}))
    diet_labels = coerce_list(safe_get(recipe, "diet_labels", []))
    cautions    = coerce_list(safe_get(recipe, "cautions", []))

    return {
        "recipe_name": str(safe_get(recipe, "recipe_name", "")),
        "calories":    str(safe_get(recipe, "calories", 0)),
        "diet_labels": json.dumps(diet_labels),
        "cautions":    json.dumps(cautions),
        "protein":     str(nutrients.get("protein", 0)),
        "fat":         str(nutrients.get("fat", 0)),
        "carbs":       str(nutrients.get("carbs", 0)),
        "fiber":       str(nutrients.get("fiber", 0)),
    }


# =========================================================
# Build DB
# =========================================================

def build_recipe_db():

    if os.path.exists(DB_PATH):
        shutil.rmtree(DB_PATH)
        print("🧹 Deleted old database")

    client = chromadb.PersistentClient(path=DB_PATH)
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=emb_fn
    )

    print("📥 Loading dataset from HuggingFace...")
    dataset = load_dataset(DATASET_NAME, split=f"train[:{MAX_RECIPES}]")
    print(f"🍽️  Loaded {len(dataset)} recipes")

    # Quick sanity check on first record so problems are caught early
    first = dataset[0]
    print("\n--- Sanity check (first recipe) ---")
    print("ingredient_lines type:", type(first.get("ingredient_lines")))
    print("ingredient_lines raw:", repr(first.get("ingredient_lines"))[:200])
    sample_doc = recipe_to_document(first)
    print("sample document:\n", sample_doc[:400])
    print("---\n")

    documents = []
    metadatas = []
    ids       = []

    for i, recipe in enumerate(dataset):
        documents.append(recipe_to_document(recipe))
        metadatas.append(recipe_to_metadata(recipe))
        ids.append(str(i))

    print("🧠 Embedding + inserting into ChromaDB...")

    batch_size = 100
    for i in range(0, len(documents), batch_size):
        collection.add(
            documents=documents[i : i + batch_size],
            metadatas=metadatas[i : i + batch_size],
            ids=ids[i : i + batch_size],
        )
        print(f"✔ {min(i + batch_size, len(documents))}/{len(documents)}")

    print("\n✅ Done!")
    print(f"Collection : {COLLECTION_NAME}")
    print(f"Total docs : {collection.count()}")


# =========================================================
# Run
# =========================================================

if __name__ == "__main__":
    build_recipe_db()
