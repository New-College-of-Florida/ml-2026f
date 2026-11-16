# PPMI and SVD Walkthrough

This dependency-free browser demonstration walks through the central code from
`PPMI-SVD.py` one line at a time. The left pane highlights the current Python
line; the right pane visualizes corpus counts, a word--context matrix, PPMI,
SVD, compact word vectors, and cosine-similarity neighbors.

The counts and similarity scores shown in the demonstration come from the
Wall Street Journal corpus and the 1,000-word model used in the accompanying
notebook.

Run it locally from this directory:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Use the up/down arrow keys, the buttons, or
click a code line to navigate.

Run the dependency-free logic checks with:

```bash
node test.js
```
