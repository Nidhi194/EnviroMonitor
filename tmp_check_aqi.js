const http = require('http');
http.get('http://localhost:3000/api/live-aqi', (res) => {
  console.log('STATUS', res.statusCode);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('BODY', body);
  });
}).on('error', (err) => {
  console.error('ERR', err.message);
});
