require('dotenv').config();
const mysql = require('mysql2');
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.query("SELECT id, industry_name, monitoring_date as date, 'PM10 Report' as type FROM pm10_data WHERE user_email = 'test'", (err) => console.log('pm10:', err ? err.message : 'OK'));
db.query("SELECT id, industry_name, monitoring_date as date, 'SO2 Report' as type FROM so2_data WHERE user_email = 'test'", (err) => console.log('so2:', err ? err.message : 'OK'));
db.query("SELECT id, industry_name, monitoring_date as date, 'NO2 Report' as type FROM no2_data WHERE user_email = 'test'", (err) => console.log('no2:', err ? err.message : 'OK'));
db.query("SELECT id, industry_name, monitoring_date as date, 'PM2.5 Report' as type FROM pm25_data WHERE user_email = 'test'", (err) => console.log('pm25:', err ? err.message : 'OK'));

setTimeout(() => db.end(), 2000);
