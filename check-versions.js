// Verify versions.js changelog API
const http = require('http');
http.get('http://localhost:3008/api/version/changelog', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const versions = JSON.parse(data);
    console.log('Total versions:', versions.length);
    versions.slice(0, 4).forEach(v => console.log(' ', v.version, '-', v.title));
    console.log('---');
    console.log('V1.6.20 present:', versions.some(v => v.version === 'V1.6.20'));
    console.log('V1.6.19 present:', versions.some(v => v.version === 'V1.6.19'));
  });
}).on('error', e => console.error('ERROR:', e.message));
