const fs = require('fs');
const content = fs.readFileSync('src/pages/client/Cards.tsx', 'utf8');
const lines = content.split('\n');

let openTags = [];
// This is not a full XML parser, but I can just run tsc.
