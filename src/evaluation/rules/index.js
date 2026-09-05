'use strict';

const { baseRules } = require('./base');
const { processRules } = require('./process');

function rulesForComplexity(complexityClass) {
  if (complexityClass === 'multi_step_process') {
    return [...baseRules, ...processRules];
  }
  return [...baseRules];
}

module.exports = { baseRules, processRules, rulesForComplexity };
