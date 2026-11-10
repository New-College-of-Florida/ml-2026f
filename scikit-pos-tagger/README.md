# Scikit-learn POS Tagger Walkthrough

This dependency-free browser demonstration walks through the compact
`scikit-tagging-simple.py` example line by line. The left pane highlights the
current Python line; the right pane visualizes the corresponding corpus split,
feature dictionary, sparse matrix, estimator, training operation, or accuracy
calculation.

Run it locally from this directory:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Use the up/down arrow keys or the buttons
to navigate.

The displayed sentence and matrix rows are small teaching examples. The corpus
sizes and final accuracy correspond to the full Penn Treebank experiment used
in class.

Run the dependency-free logic checks with:

```bash
node test.js
```
