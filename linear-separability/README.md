# Linear Separability Explorer

Open `index.html` directly in a browser. The demonstration has no runtime
network or package dependencies.

The explorer compares linear and nonlinear binary classifiers on deterministic
two-dimensional datasets. It can animate one training example at a time, stop
and resume training, display the decision regions, and lift the classifier's
score into a three-dimensional surface. Clicking the main plot adds custom red
or blue examples.

The linear perceptron, averaged perceptron, logistic regression, and linear SVM
use the signed-score conventions in the textbook. The ensembled perceptron
trains each member for exactly one independently shuffled epoch and sums the
members' final weight vectors. Gaussian Naive Bayes is included as a closed-form
comparison rather than an SGD algorithm. The two RBF models demonstrate that a
kernel can produce a nonlinear boundary while retaining a linear update in its
implicit feature space. A k-nearest-neighbor option adds an untrained,
memory-based model whose local majority votes create highly irregular decision
regions. A small, from-scratch neural network learns a nonlinear projection
through one hidden layer before applying its final linear score; its hidden
activation can be tanh, sigmoid, or ReLU.

For kNN, the reported score is leave-one-out accuracy: when a stored example is
evaluated, that example cannot select itself as a neighbor. The decision-region
plot still uses every stored example when classifying new locations.

Selecting Gaussian Naive Bayes reveals a pair of one-dimensional distribution
panels below the score surface. They separate the x- and y-coordinates and show
the observed class values, fitted means, variances, and shaded Gaussian density
for each class.

## Development check

Run the dependency-free core checks with:

```sh
node test.js
```
