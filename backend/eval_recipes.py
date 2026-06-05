import os
from datasets import Dataset
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from openai import OpenAI
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy
from webrtc_server import query_recipe_data

questions = [
    "How many calories does the Tomato Basil Soup recipe contain?",
    "What is the protein content of the Lentil Soup with Cumin & Coriander?",
    "How much fat is in the Pork Burgers with Jalapeno recipe?",
    "What is the fiber content of the Baigan Choka recipe?",
    "How many carbohydrates does the Carrot Cake Cupcakes recipe contain?",
    "What is the saturated fat content of the Crab Rangoon Cupcakes?",
    "How much sugar is in the PBJ cookie ice cream sandwiches?",
    "What is the sodium content of the Lentil Soup with Cumin & Coriander?",
    "How many calories does the Smooth Pumpkin and Lentil Puree contain?",
    "What is the protein content of the Old Bay Fried Chicken?",
    "How much fiber is in the Vegan Sweet Potato Kugel Recipe?",
    "What is the fat content of the Macaroni and Cheese recipe?",
    "How many carbohydrates does the Mushroom Dumplings recipe contain?",
    "What is the sugar content of the Baigan Choka recipe?",
    "How much sodium is in the Crab Rangoon Cupcakes recipe?",
    "What is the calorie content of the No-Knead Peasant Bread?",
    "How much protein is in the Red Beans and Rice recipe?",
    "What is the saturated fat content of the Pineapple Pie I?",
    "How much fiber is in the Lentil Soup with Cumin & Coriander?",
    "What is the carbohydrate content of the Strawberry Peach Jam Recipe 4?",
    "Which has more calories: Old Bay Fried Chicken or Crab Rangoon Cupcakes?",
    "Which recipe has more protein: Quick Lemon Balsamic Basil Chicken Pasta or Red Beans and Rice?",
    "Compare the fiber content of Baigan Choka and Vegan Sweet Potato Kugel. Which is higher?",
    "Which has more fat: Pork Burgers with Jalapeno or Old Bay Fried Chicken?",
    "Does Macaroni and Cheese have more carbs than Mushroom Dumplings?",
    "Which has higher sodium: Lentil Soup with Cumin & Coriander or Crab Rangoon Cupcakes?",
    "Compare the saturated fat of PBJ cookie ice cream sandwiches and Pineapple Pie I. Which is higher?",
    "Which recipe has more sugar: Carrot Cake Cupcakes or PBJ cookie ice cream sandwiches?",
    "Is the protein in Old Bay Fried Chicken higher than in Red Beans and Rice?",
    "Rank these three by calories from lowest to highest: Tomato Basil Soup, Smooth Pumpkin and Lentil Puree, Homemade Strawberry Vinegar.",
]

ground_truths = [
    "Approximately 454.61 kcal.",
    "Approximately 103.2g of protein.",
    "Approximately 192.73g of fat.",
    "Approximately 66.97g of fiber.",
    "Approximately 471.42g of carbohydrates.",
    "Approximately 128.72g of saturated fat.",
    "Approximately 353.1g of sugar.",
    "Approximately 6.626g of sodium.",
    "Approximately 368.08 kcal.",
    "Approximately 244.51g of protein.",
    "Approximately 48.28g of fiber.",
    "Approximately 66.38g of fat.",
    "Approximately 362.47g of carbohydrates.",
    "Approximately 83.58g of sugar.",
    "Approximately 6.631g of sodium.",
    "Approximately 1460.47 kcal.",
    "Approximately 248.79g of protein.",
    "Approximately 71.18g of saturated fat.",
    "Approximately 58.03g of fiber.",
    "Approximately 1088.71g of carbohydrates.",
    "Old Bay Fried Chicken is higher with 5628.34 kcal vs Crab Rangoon Cupcakes at 4044.98 kcal.",
    "Red Beans and Rice has more protein (248.79g) vs Quick Lemon Balsamic Basil Chicken Pasta (107.65g).",
    "Baigan Choka is higher with 66.97g of fiber vs Vegan Sweet Potato Kugel at 48.28g.",
    "Old Bay Fried Chicken has more fat (464.49g) vs Pork Burgers with Jalapeno (192.73g).",
    "Yes. Macaroni and Cheese has 217.97g of carbs, which is less than Mushroom Dumplings at 362.47g. Mushroom Dumplings has more.",
    "Crab Rangoon Cupcakes is higher with 6.631g of sodium vs Lentil Soup at 6.626g. They are virtually equal.",
    "PBJ cookie ice cream sandwiches is higher with 172.07g vs Pineapple Pie I at 71.18g.",
    "PBJ cookie ice cream sandwiches has more sugar (353.1g) vs Carrot Cake Cupcakes (237.7g).",
    "Yes. Old Bay Fried Chicken has 244.51g of protein, which is higher than Red Beans and Rice at 248.79g. Actually Red Beans and Rice is slightly higher.",
    "Homemade Strawberry Vinegar (80.47 kcal) < Smooth Pumpkin and Lentil Puree (368.08 kcal) < Tomato Basil Soup (454.61 kcal).",
]

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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
    """Simulates the RAG system using the recipe database."""
    context = query_recipe_data(question, n_results=5)

    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": f"You are a recipe assistant. Use this recipe data to answer accurately:\n\n{context}"},
            {"role": "user", "content": question}
        ]
    )
    return res.choices[0].message.content, [context]


# --- RUN EVALUATION ---

rag_eval_data = []
vanilla_eval_data = []

print(f"Evaluating {len(questions)} questions...")

for q, gt in zip(questions, ground_truths):
    rag_ans, rag_context = get_rag_response(q)
    rag_eval_data.append({
        "question": q,
        "answer": rag_ans,
        "contexts": rag_context,
        "ground_truth": gt
    })

    vanilla_ans = get_vanilla_response(q)
    vanilla_eval_data.append({
        "question": q,
        "answer": vanilla_ans,
        "contexts": ["None available."],
        "ground_truth": gt
    })

rag_ds = Dataset.from_list(rag_eval_data)
vanilla_ds = Dataset.from_list(vanilla_eval_data)

print("\nCalculating Ragas Scores (this may take a minute)...")

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
