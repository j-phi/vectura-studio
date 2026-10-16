const { describeDispatchPart, MONO_LAWS } = require('../helpers/scene3d-tone-law-dispatch-shared');

// Split part of the 46-way tone-law dispatch matrix. See the SPLIT NOTE and the
// full rationale in tests/helpers/scene3d-tone-law-dispatch-shared.js.
// Mono laws on hatch (tests 2, 3) and on crosshatch (test 7).
describeDispatchPart({ laws: MONO_LAWS, baselineTests: false, markLawTest: false, crossTest: true });
