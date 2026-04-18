const https = require('https');
const url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.7041&longitude=77.1025&hourly=pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide&timezone=auto';
https.get(url, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    const payload = JSON.parse(body);
    const hourly = payload.hourly || {};
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    const findLastValidIndex = (keys) => {
      for (let idx = times.length - 1; idx >= 0; idx--) {
        if (keys.some((key) => Array.isArray(hourly[key]) && hourly[key][idx] != null)) {
          return idx;
        }
      }
      return -1;
    };
    const lastIndex = findLastValidIndex(['pm2_5', 'pm10', 'nitrogen_dioxide', 'sulphur_dioxide']);
    console.log('lastIndex', lastIndex, 'time', times[lastIndex]);
    const comps = {
      pm2_5: Array.isArray(hourly.pm2_5) && hourly.pm2_5[lastIndex] != null ? hourly.pm2_5[lastIndex] : 0,
      pm10: Array.isArray(hourly.pm10) && hourly.pm10[lastIndex] != null ? hourly.pm10[lastIndex] : 0,
      no2: Array.isArray(hourly.nitrogen_dioxide) && hourly.nitrogen_dioxide[lastIndex] != null ? hourly.nitrogen_dioxide[lastIndex] : 0,
      so2: Array.isArray(hourly.sulphur_dioxide) && hourly.sulphur_dioxide[lastIndex] != null ? hourly.sulphur_dioxide[lastIndex] : 0,
    };
    console.log('comps', comps);
    console.log('raw', hourly.pm2_5 ? hourly.pm2_5[lastIndex] : undefined, hourly.pm10 ? hourly.pm10[lastIndex] : undefined, hourly.nitrogen_dioxide ? hourly.nitrogen_dioxide[lastIndex] : undefined, hourly.sulphur_dioxide ? hourly.sulphur_dioxide[lastIndex] : undefined);
  });
}).on('error', (err) => {
  console.error(err);
});
