const fs = require('fs');
const f = '/var/www/amoschool/frontend/src/App.jsx';
let src = fs.readFileSync(f, 'utf8');
src = src.replace("const APP_VERSION = 'V1.1.4'", "const APP_VERSION = 'V1.1.5'");
fs.writeFileSync(f, src, 'utf8');
console.log('APP_VERSION → V1.1.5');
