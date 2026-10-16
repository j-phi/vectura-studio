const { describeDispatchPart, WAVE_LAWS, CHEAP_LAWS } = require('../helpers/scene3d-tone-law-dispatch-shared');

// Split part of the 46-way tone-law dispatch matrix. See the SPLIT NOTE and the
// full rationale in tests/helpers/scene3d-tone-law-dispatch-shared.js.
// Wave laws plus every cheap law (incl. the 4 mark laws for test 4).
describeDispatchPart({ laws: [...WAVE_LAWS, ...CHEAP_LAWS], baselineTests: false, markLawTest: true, crossTest: false });
