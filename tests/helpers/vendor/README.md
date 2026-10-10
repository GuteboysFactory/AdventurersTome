# Template test compiler

`handlebars-4.7.10.cjs` is the standalone Handlebars 4.7.10 compiler, with its MIT license retained in the file. Source: https://github.com/components/handlebars.js (standalone `handlebars.js` distribution).

Used only by `tests/qa42-relationship-presentation.test.mjs` to precompile the entire real Tome template and render actual profile/inline-partial compositions without an installed npm dependency or network access. It is not registered in the Foundry manifest and does not replace Foundry's template engine.
