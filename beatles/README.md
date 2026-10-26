# Lennon or McCartney? A walk-through

A clickable slide deck explaining Glickman, Brown & Song (2019), ["(A) Data in
the Life: Authorship Attribution in Lennon-McCartney
Songs"](https://hdsr.mitpress.mit.edu/pub/xcq8a1v1/release/7), *Harvard Data
Science Review* 1.1.

The published demonstration is available at
<https://new-college-of-florida.github.io/ml-2026f/beatles/>.

Run it from this directory with

    python -m http.server

and open <http://localhost:8000/>. Navigate with the arrow keys, Page Up/Down,
or the buttons; `#n` in the URL jumps to slide n. There are no runtime network
or package dependencies.

Most of the deck covers feature design: transposition to scale degrees, the
nine chord bins, chord-change and melodic-move "bigrams" (with phrase-boundary
rests), four-note contours, presence versus counts, and frequency filtering.
These slides run on two short made-up songs (not Beatles transcriptions). The
melodic-move rules are a simplified version of the paper's scheme, so the
category counts differ from the paper's 24 and 65.

Numbers from the paper live in `data.js`: the 70 leave-one-out predictions
(Tables 2–3), the 29 final coefficients with their c-statistics (Table 4), and
the disputed and collaborative predictions (Tables 5–6). The ROC curve, AUC
(0.837), and accuracy (75.7%) are recomputed from Tables 2–3. The 70 × 137
matrix picture and the screening counts are illustrative and say so on the
slides.

`node test.js` checks the feature extractor, the transposition invariance, the
reproduced summary statistics, and that every slide renders.
