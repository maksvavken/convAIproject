import pandas as pd
import chromadb
from chromadb.utils import embedding_functions
import os
from dotenv import load_dotenv

# Load environment variables from .env next to this script (not cwd)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

emb_fn = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.getenv("OPENAI_API_KEY"),
    model_name="text-embedding-3-small"
)

def clean_value(val):
    """Handles '<0.1', 'N/A', and other non-numeric strings."""
    s = str(val).strip()
    if s == "N/A" or s == "":
        return "0"
    if s.startswith("<"):
        return s.replace("<", "") 
    return s

def food_row_to_descriptive_sentence(row: dict) -> str:
    parts = []
    name = row.get('name') or 'unknown food'
    parts.append(f"Food item '{name}'.")

    energy = clean_value(row.get('energy,calculated (kJ)'))
    protein = clean_value(row.get('protein, total (g)'))
    fat = clean_value(row.get('fat, total (g)'))
    carbs = clean_value(row.get('carbohydrate, available (g)'))

    summary = f"Per 100g, this food provides {energy} kJ of energy"
    summary += f", {protein}g of protein, {fat}g of total fat, and {carbs}g of carbohydrates."
    parts.append(summary)

    exclude_keys = {'id', 'name', 'energy,calculated (kJ)', 'protein, total (g)', 
                    'fat, total (g)', 'carbohydrate, available (g)'}
    
    detailed = []
    for k, v in row.items():
        val = clean_value(v)
        if k not in exclude_keys and val != "0":
            clean_k = k.split('(')[0].replace(',', '').strip()
            detailed.append(f"{clean_k} is {val}")
    
    if detailed:
        parts.append("Contains: " + ", ".join(detailed) + ".")

    return " ".join(parts)

def fill_nutrition_db(csv_path: str, db_path: str):
    import shutil
    if os.path.exists(db_path):
        shutil.rmtree(db_path)
        print("Cleaned old database.")

    client = chromadb.PersistentClient(path=db_path)
    collection = client.get_or_create_collection(name="nutrition_data", embedding_function=emb_fn)

    df = pd.read_csv(csv_path, sep=';').fillna("0") 

    documents, metadatas, ids = [], [], []

    print(f"Processing {len(df)} items...")
    for index, row in df.iterrows():
        row_dict = row.to_dict()
        doc = food_row_to_descriptive_sentence(row_dict)
        
        metadata = {k: str(v) for k, v in row_dict.items()}
        
        documents.append(doc)
        metadatas.append(metadata)
        ids.append(str(row_dict.get('id', index)))

    batch_size = 100
    for i in range(0, len(documents), batch_size):
        collection.add(
            documents=documents[i:i + batch_size],
            metadatas=metadatas[i:i + batch_size],
            ids=ids[i:i + batch_size]
        )
    print("Success! Database populated with correct values.")

fill_nutrition_db("data/resultset.csv", "./chroma_db")