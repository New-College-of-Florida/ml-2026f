# Hierarchical Clustering Demo

Open `index.html` directly in a browser. The demonstration has no runtime
network or package dependencies.

The default data are the abbreviated eight-language Swadesh-style list in
the textbook introduction. The textbook similarity counts distinct letters
shared by each pair of aligned words, then averages those ten scores for each
language pair. Agglomerative hierarchical clustering uses average linkage.

The editable table allows small experiments with the data. Two additional
metrics—letter-set Jaccard similarity and letter-bigram Jaccard similarity—show
how changing the representation or similarity measure can change the tree.

An always-visible personal-language column lets a student enter the same ten
words in another language and name it. The column is excluded from all
calculations by default; selecting **Include your language in the clustering**
adds it to the similarity matrix, merge sequence, and dendrogram.
