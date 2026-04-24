import os
from datasets import Dataset
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from openai import OpenAI
from ragas import evaluate
# Updated imports to avoid DeprecationWarning
from ragas.metrics import faithfulness, answer_relevancy 
from webrtc_server import query_nutrition_data

# The 'question' list
questions = [
    "How many mg of Calcium are in 100g of the 4-Grain Flakes?",
    "What is the salt content of Liver Casserole, Industrial, Ready Meal?",
    "What is the energy value in kJ for Margarine 40%, Rainbow?",
    "How many grams of total sugar are in the May Day Fritter?",
    "What is the protein content of Meatballs With Mashed Potato, Atria?",
    "How much sodium is in the Meat Bouillon?",
    "How much Vitamin D is added to the Milk, 0% Fat, Low-Lactose?",
    "What is the total carbohydrate content of Muesli, Pirkka Kilomysli?",
    "How much fiber is in the Multigrain Bread Roll (Ruisvehnäsämpylä)?",
    "What is the sugar content of Muskmelon/Cantaloupe Melon?",
    "What is the Vitamin B-12 content in the Mussel Gravy?",
    "How much cholesterol is in Mussel In Water, Canned?",
    "What is the total fat content of Mustard?",
    "What is the protein content of the Mutton And Pork, Boiled Mixture?",
    "How much fiber is in the Northern Milkcap (mushroom)?",
    "How much Vitamin A (retinol activity) is in Pasha (Pascha)?",
    "What is the starch content of the Nut Patty?",
    "How much fiber is in the Oat, Coarse-Ground Oat (Kaurakuitunen)?",
    "What is the energy content in kJ of Onion Stuffed With Rice And Pork?",
    "How much Vitamin C is in an Orange with skin?",
    "What is the total sugar content of Passion Fruit?",
    "How much protein is in the Dark High Protein Pasta?",
    "How much Vitamin C is added to the Pastille Sweetened With Xylitol?",
    "What is the sucrose content of Pastry With Potato And Cocoa?",
    "How many carbohydrates are in Green Peas?",
    "What is the fat content of Pike, Filled With Prunes?",
    "What is the salt content of Ham And Mushroom Pizza?",
    "How much protein is in the Vanilla Sauce Without Milk?",
    "What is the magnesium content of 4-Grain Flakes?",
    "How much iron is in the Liver Casserole?",
    "Which has more protein per 100g: the Dark High Protein Pasta or the Mutton And Pork mixture?",
    "What is the total energy in kJ if I eat 100g of 4-Grain Flakes and 100g of Muesli (Pirkka Kilomysli)?",
    "Compare the salt content of the Liver Casserole and the Ham And Mushroom Pizza. Which is higher?",
    "Does the Milk (0% Fat, Low-Lactose) have more Vitamin D than the Orange has Vitamin C?",
    "Which food item has the higher cholesterol: Mussel In Water or the Onion Stuffed With Rice And Pork?",
    "If a meal consists of 100g of Meatballs With Mashed Potato and 100g of Green Peas, what is the combined protein?",
    "Identify which has a higher fiber-to-carbohydrate ratio: Multigrain Bread Roll or the Northern Milkcap mushroom.",
    "Is the sugar content in the May Day Fritter higher than the sucrose in the Pastry With Potato And Cocoa?",
    "Rank these three by energy (kJ) from lowest to highest: Onion Stuffed With Rice, Nut Patty, and Pike Filled With Prunes.",
    "Does the 4-Grain Flakes contain more Calcium than the Magnesium it provides?",
]

# The 'ground_truth' list (matched 1:1 with questions)
ground_truths = [
    "30.0 mg", "976.3 mg", "1486 kJ", "11.7 g", "5.0 g", 
    "353.0 mg", "1.0 µg", "64.7 g", "5.7 g", "2.0 g",
    "6.9 µg", "66.7 mg", "6.0 g", "23.8 g", "4.6 g",
    "211.1 µg", "15.9 g", "69.7 g", "509 kJ", "36.7 mg",
    "13.0 g", "23.8 g", "365.6 mg", "27.4 g", "9.5 g",
    "3.8 g", "944.4 mg", "1.4 g", "109.0 mg", "2.9 mg",
    "The protein content is identical at 23.8 g for both.",
    "2836 kJ (1350 kJ from Flakes + 1486 kJ from Muesli).",
    "Liver Casserole is higher (976.3 mg) compared to Pizza (944.4 mg).",
    "No. Milk has 1.0 µg Vitamin D, while the Orange has 36.7 mg Vitamin C.",
    "Mussel In Water (66.7 mg) is significantly higher than the Onion dish (6.0 mg).",
    "14.5 g (5.0 g from Meatballs + 9.5 g from Peas).",
    "Northern Milkcap (4.6g fiber / 0g carb) is higher than the Bread Roll (5.7g fiber / 41.5g carb).",
    "No. Fritter has 11.7 g sugar, while the Pastry has 27.4 g sucrose.",
    "Onion Stuffed (509 kJ) < Pike Filled (580 kJ) < Nut Patty (1150 kJ).",
    "No. Calcium is 30.0 mg and Magnesium is 109.0 mg.",
]
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize LangChain wrappers for Ragas
evaluator_llm = ChatOpenAI(model="gpt-4o-mini")
evaluator_embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

def get_vanilla_response(question):
    """Simulates a standard AI with no database access."""
    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": question}]
    )
    return res.choices[0].message.content

def get_rag_response(question):
    """Simulates your RAG system."""
    # 1. Get context from your ChromaDB
    context = query_nutrition_data(question, n_results=3)
    
    # 2. Get LLM response using that context
    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": f"Use this data: {context}"},
            {"role": "user", "content": question}
        ]
    )
    return res.choices[0].message.content, [context]

# --- RUN EVALUATION ---

rag_eval_data = []
vanilla_eval_data = []

print(f"Evaluating {len(questions)} questions...")

for q, gt in zip(questions, ground_truths):
    # Run RAG
    rag_ans, rag_context = get_rag_response(q)
    rag_eval_data.append({
        "question": q, 
        "answer": rag_ans, 
        "contexts": rag_context, 
        "ground_truth": gt
    })
    
    # Run Vanilla
    vanilla_ans = get_vanilla_response(q)
    vanilla_eval_data.append({
        "question": q, 
        "answer": vanilla_ans, 
        "contexts": ["None available."], # Ragas prefers a string here rather than empty
        "ground_truth": gt
    })

# Convert to Ragas format
rag_ds = Dataset.from_list(rag_eval_data)
vanilla_ds = Dataset.from_list(vanilla_eval_data)

# Score them
print("\nCalculating Ragas Scores (this may take a minute)...")

# CRITICAL FIX: Pass llm and embeddings here
rag_score = evaluate(
    rag_ds, 
    metrics=[faithfulness, answer_relevancy],
    llm=evaluator_llm,
    embeddings=evaluator_embeddings
)

vanilla_score = evaluate(
    vanilla_ds, 
    metrics=[faithfulness, answer_relevancy],
    llm=evaluator_llm,
    embeddings=evaluator_embeddings
)

print("\n=================================")
print(f"RAG SYSTEM SCORE: {rag_score}")
print(f"VANILLA AI SCORE: {vanilla_score}")
print("=================================")
