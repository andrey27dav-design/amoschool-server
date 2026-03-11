const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
console.log('status:', d.status);
console.log('step:', d.step);
console.log('progress:', JSON.stringify(d.progress));
console.log('autoRunActive:', d.autoRunActive);
console.log('countdown:', d.autoRunCountdown);
console.log('stats:', JSON.stringify(d.stats));
console.log('warnings:', d.warnings?.length);
console.log('errors:', d.errors?.length);
