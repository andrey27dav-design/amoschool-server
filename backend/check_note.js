const axios = require('axios');
require('dotenv').config({path:'/var/www/amoschool/backend/.env'});
const token = process.env.AMO_TOKEN;

// Fetch note 214220983 full params
axios.get('https://houch.amocrm.ru/api/v4/leads/notes/214220983', {
  headers: { 'Authorization': 'Bearer ' + token }
}).then(r => {
  console.log('=== NOTE FULL STRUCTURE ===');
  console.log(JSON.stringify(r.data, null, 2));
}).catch(e => console.error(e.response ? JSON.stringify(e.response.data) : e.message));
