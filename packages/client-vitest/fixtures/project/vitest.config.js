// A small project for the tests of vitest.run. Its checks are not *.test files, so the
// package's own test run does not collect them.
export default { test: { include: ["checks/**/*.js"] } };
