# Perceptron Training Walkthrough

Open `index.html` directly in a browser. The demonstration has no runtime
network or package dependencies.

The walkthrough reproduces the multiclass duck-and-goose example from
`chapters/05-linear-classifiers.tex`. Both class weight vectors begin at zero,
and tied scores predict goose, matching the chapter's fixed tie-breaking rule.
The animation shows the two mistake-driven updates in epoch 1, the two correct
predictions in epoch 2, and convergence after a complete zero-error epoch.
