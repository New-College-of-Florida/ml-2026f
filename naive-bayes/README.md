# Text Classification: Counts to Dot Products

Open `index.html` directly in a browser. The demonstration has no runtime
network or package dependencies.

The example reproduces the three-review sentiment corpus from Probability II.
It moves through raw word counts, add-one smoothing, probability-space Naive
Bayes classification, log-probability weights, a count feature vector with a
fixed bias feature, and aligned class-specific dot products.

The sentence field is editable. Words outside the current training vocabulary
are identified and skipped because this tiny model has no unknown-word
feature.

The positive and negative training corpora are also editable, with one review
per line. Rebuilding the model derives a new vocabulary, class priors, count
tables, smoothed probabilities, vectors, and scores. A final stage expands the
normalization step as Bayes' Rule and distinguishes unnormalized class scores
from posterior probabilities.
