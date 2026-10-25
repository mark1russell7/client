// V8 bug (O53): after JSON.parse reads an object with the keys "" and \ (one backslash), the text
// {"":0,"\"":0} gives the keys "" and \, not "" and " (one double quote). V8 takes the one known
// next key of the hidden class when the raw source characters match it, and it ignores the escape.
//
// Run: node packages/site/scripts/v8-json-key-repro.mjs
// Exit code 1: the bug shows. Exit code 0: it does not. The script uses no imports and no repo files.
// In a new context with no earlier objects (d8, or node:vm), the keys \ and " alone are sufficient.
// The key "" goes first here: it gives a hidden class that the startup code of Node does not use.

const first = '{"":0,"\\\\":0}'; // the keys "" and \ (one backslash)
const second = '{"":0,"\\"":0}'; // the keys "" and " (one double quote)
const expected = '"';

const kept = JSON.parse(first); // Keep the object: a GC can remove the hidden class that it made
const actual = Object.keys(JSON.parse(second))[1];
const bug = actual !== expected;

console.log(`node ${process.version}, V8 ${process.versions.v8}`);
console.log(`input 1: ${first}   JSON.parse gives the keys ${JSON.stringify(Object.keys(kept))}`);
console.log(`input 2: ${second}   JSON.parse gives the second key ${JSON.stringify(actual)}`);
console.log(`expected key: ${JSON.stringify(expected)}, actual key: ${JSON.stringify(actual)}`);
console.log(bug ? "BUG: JSON.parse misread the escaped key" : "OK: JSON.parse read the escaped key correctly");
process.exitCode = bug ? 1 : 0;
