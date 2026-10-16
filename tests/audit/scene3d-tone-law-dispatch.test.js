const { describeDispatchPart, RIBBON_LAWS } = require('../helpers/scene3d-tone-law-dispatch-shared');

// Split part of the 46-way tone-law dispatch matrix. See the SPLIT NOTE and the
// full rationale in tests/helpers/scene3d-tone-law-dispatch-shared.js.
// Ribbon laws (heaviest renders) plus baseline / none / hlStage tests 1, 5, 6.
describeDispatchPart({ laws: RIBBON_LAWS, baselineTests: true, markLawTest: false, crossTest: false });
