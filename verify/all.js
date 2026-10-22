#!/usr/bin/env node
/* Runs every verification harness, each in its own process so one harness's
 * globals cannot leak into the next. Run from the project root:
 *   node verify/all.js
 *
 * CI calls this, so local runs and CI runs agree by construction. */
'use strict';

var fs = require('fs');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var dir = __dirname;
var files = fs.readdirSync(dir)
  .filter(function (f) { return /^slice-\d+\.js$/.test(f); })
  .sort(function (a, b) {
    return parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10);
  });

if (files.length === 0) {
  console.error('No harnesses found in ' + dir);
  process.exit(1);
}

var failed = [];
files.forEach(function (file) {
  var result = spawnSync(process.execPath, [path.join(dir, file)], { stdio: 'inherit' });
  if (result.status !== 0) failed.push(file);
});

if (failed.length > 0) {
  console.error('\n' + failed.length + ' harness(es) failed: ' + failed.join(', '));
  process.exit(1);
}

console.log('\nAll ' + files.length + ' harnesses passed.');
