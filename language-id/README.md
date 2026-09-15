# Naive Bayes Language Classifier

Open `index.html` directly in a browser. The demo has no runtime network or
package dependencies.

`model-data.js` contains precomputed unigram and bigram counts from the
localized Wikipedia article about machine learning in English, French,
German, Spanish, Portuguese, and Italian. Regenerate it from the repository
root with:

```bash
python3 language-id/build_language_models.py
```

The generator uses each article's plain-text MediaWiki extract, lowercases it,
retains Latin letters, converts other character runs to single spaces, and
records the exact Wikipedia revision used by the generated model.
