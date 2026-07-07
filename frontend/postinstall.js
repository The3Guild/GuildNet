const fs = require('fs');
const path = require('path');

const patches = [
  {
    file: 'node_modules/@make-software/csprclick-ui/dist/cjs/lib/index.js',
    marker: 'var f,p={exports:{}},h={};var m,y={};',
    reactIs: '/** @license React v16.13.1',
    replacement: 'var b={Fragment:Symbol.for("react.fragment"),jsx:e.createElement,jsxs:e.createElement};var g,v={exports:{}},w={},A={exports:{}},C={exports:{}},S={};var x,M,E,I,L,O,B,N,k,j,_,T,R,P,H={};'
  },
  {
    file: 'node_modules/@make-software/csprclick-ui/dist/lib/index.js',
    marker: 'var _,R={exports:{}},T={};var P,H={};',
    reactIs: '/** @license React v16.13.1',
    replacement: 'var V={Fragment:Symbol.for("react.fragment"),jsx:t.createElement,jsxs:t.createElement};var D,U={exports:{}},F={},z={exports:{}},G={exports:{}},J={};var W,Z,K,q,Q,Y,X,$,ee,te,re,ne,oe,ie,ae={};'
  }
];

let patched = 0;
for (const p of patches) {
  const fullPath = path.join(__dirname, p.file);
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    console.log('Skipping (not found):', p.file);
    continue;
  }
  const markerIdx = content.indexOf(p.marker);
  if (markerIdx === -1) {
    console.log('Already patched or unexpected structure:', p.file);
    continue;
  }
  const reactIsIdx = content.indexOf(p.reactIs, markerIdx);
  if (reactIsIdx === -1) {
    console.log('Could not find boundary:', p.file);
    continue;
  }
  const newContent = content.substring(0, markerIdx) + p.replacement + content.substring(reactIsIdx);
  fs.writeFileSync(fullPath, newContent, 'utf8');
  console.log('Patched:', p.file);
  patched++;
}

if (patched === 0) {
  console.log('No files needed patching.');
} else {
  console.log('Successfully patched', patched, 'file(s).');
}
