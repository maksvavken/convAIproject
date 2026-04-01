For starters we will import the data from a finnish food composition database.
Download the csv from https://fineli.fi/fineli/en/elintarvikkeet/resultset.csv and put it in backend/data

Run:

```
python handle_chroma.py
```

for testing I will start with two topics:
1. Diet Recommendations: "Give me top foods for a mediteranean diet."
2. Nutrient Calculation: "I have ground beef, carrots, onion, tomato sauce and pasta. Tell me the exact nutrients of this meal."

After, i will input 2 more topics:
1. Simple search: "Give me foods that have more than 30g of protein."
2. Recommendations: "Give me recomendations for a healthy breakfast with lots of proteins."

