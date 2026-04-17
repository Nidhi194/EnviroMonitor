require('dotenv-safe').config({
  allowEmptyValues: true,
  example: '.env.example'
});

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const redis = require('redis');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const morgan = require('morgan');
const { body, validationResult } = require('express-validator');
const https = require('https');
const fs = require('fs');
const csrf = require('csurf');

// Environment variables with defaults
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-session-secret-change-in-production';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Logger setup
// const logger = winston.createLogger({
//   level: 'info',
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.errors({ stack: true }),
//     winston.format.json()
//   ),
//   defaultMeta: { service: 'enviromonitor' },
//   transports: [
//     new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
//     new winston.transports.File({ filename: 'logs/combined.log' }),
//   ],
// });

// if (NODE_ENV !== 'production') {
//   logger.add(new winston.transports.Console({
//     format: winston.format.simple(),
//   }));
// }

// Redis client for sessions
let redisClient = null;
if (REDIS_URL !== 'redis://localhost:6379' || process.env.REDIS_HOST) {
  redisClient = redis.createClient({ url: REDIS_URL });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  redisClient.connect().catch(console.error);
}

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://nominatim.openstreetmap.org", "https://air-quality-api.open-meteo.com"],
    },
  },
}));

// Compression
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://localhost:3000',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Auth specific rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth attempts per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Session configuration
app.use(session({
  store: redisClient ? new RedisStore({ client: redisClient }) : undefined,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production', // Use HTTPS in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => console.log(message.trim())
  }
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization middleware
app.use((req, res, next) => {
  // Sanitize string inputs
  const sanitize = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  next();
});

function getClientIp(req) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return xff || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs, maxRequests }) {
    const hits = new Map();

    return function rateLimiter(req, res, next) {
        const now = Date.now();
        const ip = getClientIp(req);
        const key = `${ip}:${req.path}`;
        const entry = hits.get(key) || { count: 0, resetAt: now + windowMs };

        if (now > entry.resetAt) {
            entry.count = 0;
            entry.resetAt = now + windowMs;
        }

        entry.count += 1;
        hits.set(key, entry);

        if (entry.count > maxRequests) {
            return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
        }

        next();
    };
}

app.use((req, res, next) => {
    const privatePages = [
        '/pages/h.html',
        '/pages/agency-info.html',
        '/pages/agency-dash.html',
        '/pages/industry.html',
        '/pages/industry-reports.html'
    ];

    if (privatePages.some(page => req.path.includes(page))) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    next();
});
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'user_db',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    waitForConnections: true,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
};

if (String(process.env.DB_SSL || '').toLowerCase() === 'true') {
    dbConfig.ssl = {
        rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() === 'true',
        ca: process.env.DB_SSL_CA ? fs.readFileSync(process.env.DB_SSL_CA) : undefined,
        cert: process.env.DB_SSL_CERT ? fs.readFileSync(process.env.DB_SSL_CERT) : undefined,
        key: process.env.DB_SSL_KEY ? fs.readFileSync(process.env.DB_SSL_KEY) : undefined,
    };
}

const db = mysql.createPool(dbConfig);

const dbPromise = db.promise();

// Database connection error handling
db.on('connection', (connection) => {
    console.log('Database connected');
    connection.on('error', (err) => {
        console.error('Database connection error:', err);
    });
});

db.on('error', (err) => {
    console.error('Database pool error:', err);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    db.getConnection((err, connection) => {
        if (err) {
            console.error('Health check failed:', err);
            return res.status(503).json({
                status: 'error',
                database: 'disconnected',
                timestamp: new Date().toISOString()
            });
        }
        connection.release();
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString(),
            environment: NODE_ENV
        });
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    db.end(() => {
        console.log('Database connections closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    db.end(() => {
        console.log('Database connections closed');
        process.exit(0);
    });
});

app.get('/api/live-aqi', authLimiter, async (req, res) => {
    const location = req.query.location || 'delhi';
    let latitude = 28.7041;
    let longitude = 77.1025;
    let locationLabel = 'Delhi, India';

    if (location.startsWith('geo:')) {
        const coords = location.slice(4).split(';');
        if (coords.length === 2) {
            const parsedLat = parseFloat(coords[0]);
            const parsedLon = parseFloat(coords[1]);
            if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
                latitude = parsedLat;
                longitude = parsedLon;
                locationLabel = 'Your Location';
                
                // Try to reverse geocode for better location name
                try {
                    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=10&addressdetails=1`;
                    const geoResponse = await new Promise((resolve, reject) => {
                        const req = https.get(geoUrl, {
                            headers: {
                                'User-Agent': 'EnviroMonitor/1.0 (https://enviromonitor.in)'
                            }
                        }, (response) => {
                            let body = '';
                            response.on('data', (chunk) => body += chunk);
                            response.on('end', () => {
                                if (response.statusCode !== 200) {
                                    reject(new Error(`HTTP ${response.statusCode}`));
                                } else {
                                    resolve(body);
                                }
                            });
                        });
                        req.on('error', reject);
                    });
                    const geoData = JSON.parse(geoResponse);
                    if (geoData && geoData.display_name) {
                        // Extract city/state/country from the address
                        const address = geoData.address || {};
                        const city = address.city || address.town || address.village || address.hamlet;
                        const state = address.state;
                        const country = address.country;
                        const parts = [city, state, country].filter(Boolean);
                        locationLabel = parts.slice(0, 2).join(', ') || geoData.display_name.split(',')[0];
                    }
                } catch (geoError) {
                    console.log('Server-side reverse geocode failed:', geoError.message);
                }
            }
        }
    }

    try {
        const apiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&hourly=pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide&timezone=auto`;
        const data = await new Promise((resolve, reject) => {
            https.get(apiUrl, (response) => {
                let body = '';
                response.on('data', (chunk) => body += chunk);
                response.on('end', () => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`HTTP ${response.statusCode}: ${body}`));
                    } else {
                        resolve(body);
                    }
                });
            }).on('error', reject);
        });

        const payload = JSON.parse(data);
        const hourly = payload.hourly || {};
        const times = hourly.time || [];
        const lastIndex = times.length - 1;
        if (lastIndex < 0) {
            throw new Error('No hourly AQI data available');
        }

        const components = {
            pm2_5: hourly.pm2_5 ? hourly.pm2_5[lastIndex] : 0,
            pm10: hourly.pm10 ? hourly.pm10[lastIndex] : 0,
            no2: hourly.nitrogen_dioxide ? hourly.nitrogen_dioxide[lastIndex] : 0,
            so2: hourly.sulphur_dioxide ? hourly.sulphur_dioxide[lastIndex] : 0
        };

        const usAqi = calculateUSAQI(components);

        const transformed = {
            list: [{
                main: { aqi: usAqi },
                components: components
            }],
            city: { name: locationLabel }
        };

        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        return res.json(transformed);
    } catch (error) {
        console.error('Live AQI proxy error:', error);
        return res.status(500).json({ error: 'Unable to fetch live AQI data', details: error.message });
    }
});

const PROFESSIONAL_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function isValidProfessionalEmail(value) {
    const email = normalizeEmail(value);
    if (!email || /\s/.test(email)) return false;
    return PROFESSIONAL_EMAIL_REGEX.test(email);
}

function requireValidEmail(res, value, fieldLabel = 'email') {
    if (!isValidProfessionalEmail(value)) {
        res.status(400).json({ error: `Invalid ${fieldLabel}. Please enter a valid professional email address.` });
        return null;
    }
    return normalizeEmail(value);
}

function toNumber(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : 0;
}

/** Normalize MySQL DATE/DATETIME (mysql2 may return Date) to YYYY-MM-DD for API + UI. */
function formatMonitoringDateForApi(val) {
    if (val == null || val === '') return null;
    if (val instanceof Date) {
        if (Number.isNaN(val.getTime())) return null;
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(val).trim();
    const isoDay = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDay) return isoDay[1];
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return s;
}

// US AQI calculation based on EPA breakpoints
function calculateUSAQI(components) {
    const pollutants = [
        { name: 'pm2_5', value: components.pm2_5 || 0, breakpoints: [
            { low: 0, high: 12, aqiLow: 0, aqiHigh: 50 },
            { low: 12, high: 35.4, aqiLow: 50, aqiHigh: 100 },
            { low: 35.4, high: 55.4, aqiLow: 100, aqiHigh: 150 },
            { low: 55.4, high: 150.4, aqiLow: 150, aqiHigh: 200 },
            { low: 150.4, high: 250.4, aqiLow: 200, aqiHigh: 300 },
            { low: 250.4, high: 350.4, aqiLow: 300, aqiHigh: 400 },
            { low: 350.4, high: 500.4, aqiLow: 400, aqiHigh: 500 }
        ]},
        { name: 'pm10', value: components.pm10 || 0, breakpoints: [
            { low: 0, high: 54, aqiLow: 0, aqiHigh: 50 },
            { low: 54, high: 154, aqiLow: 50, aqiHigh: 100 },
            { low: 154, high: 254, aqiLow: 100, aqiHigh: 150 },
            { low: 254, high: 354, aqiLow: 150, aqiHigh: 200 },
            { low: 354, high: 424, aqiLow: 200, aqiHigh: 300 },
            { low: 424, high: 504, aqiLow: 300, aqiHigh: 400 },
            { low: 504, high: 604, aqiLow: 400, aqiHigh: 500 }
        ]},
        { name: 'no2', value: components.no2 || 0, breakpoints: [
            { low: 0, high: 53, aqiLow: 0, aqiHigh: 50 },
            { low: 53, high: 100, aqiLow: 50, aqiHigh: 100 },
            { low: 100, high: 360, aqiLow: 100, aqiHigh: 150 },
            { low: 360, high: 649, aqiLow: 150, aqiHigh: 200 },
            { low: 649, high: 1249, aqiLow: 200, aqiHigh: 300 },
            { low: 1249, high: 1649, aqiLow: 300, aqiHigh: 400 },
            { low: 1649, high: 2049, aqiLow: 400, aqiHigh: 500 }
        ]},
        { name: 'so2', value: components.so2 || 0, breakpoints: [
            { low: 0, high: 35, aqiLow: 0, aqiHigh: 50 },
            { low: 35, high: 75, aqiLow: 50, aqiHigh: 100 },
            { low: 75, high: 185, aqiLow: 100, aqiHigh: 150 },
            { low: 185, high: 304, aqiLow: 150, aqiHigh: 200 },
            { low: 304, high: 604, aqiLow: 200, aqiHigh: 300 },
            { low: 604, high: 804, aqiLow: 300, aqiHigh: 400 },
            { low: 804, high: 1004, aqiLow: 400, aqiHigh: 500 }
        ]}
    ];

    let maxAQI = 0;
    for (const pollutant of pollutants) {
        const value = pollutant.value;
        for (const bp of pollutant.breakpoints) {
            if (value >= bp.low && value <= bp.high) {
                const aqi = ((bp.aqiHigh - bp.aqiLow) / (bp.high - bp.low)) * (value - bp.low) + bp.aqiLow;
                maxAQI = Math.max(maxAQI, Math.round(aqi));
                break;
            }
        }
    }
    return maxAQI;
}

async function insertAgencyCombinedReport(data) {
    const pm10 = data.pm10 || {};
    const so2 = data.so2 || {};
    const no2 = data.no2 || {};
    const pm25 = data.pm25 || {};

    const industry_name = String(data.industry_name || '').trim();
    const location = String(data.location || '').trim();
    const monitoring_date = String(data.monitoring_date || '').trim();
    const user_email = String(data.user_email || '').trim();
    const status = String(data.status || 'Published').trim();

    const T_PM10 = 480;
    const q1_1 = toNumber(pm10.q1_1), q2_1 = toNumber(pm10.q2_1), w1_1 = toNumber(pm10.w1_1), w2_1 = toNumber(pm10.w2_1);
    const q1_2 = toNumber(pm10.q1_2), q2_2 = toNumber(pm10.q2_2), w1_2 = toNumber(pm10.w1_2), w2_2 = toNumber(pm10.w2_2);
    const q1_3 = toNumber(pm10.q1_3), q2_3 = toNumber(pm10.q2_3), w1_3 = toNumber(pm10.w1_3), w2_3 = toNumber(pm10.w2_3);
    const avg_1 = (q1_1 + q2_1) / 2, avg_2 = (q1_2 + q2_2) / 2, avg_3 = (q1_3 + q2_3) / 2;
    const volume_1 = avg_1 * T_PM10, volume_2 = avg_2 * T_PM10, volume_3 = avg_3 * T_PM10;
    const dust_1 = w2_1 - w1_1, dust_2 = w2_2 - w1_2, dust_3 = w2_3 - w1_3;
    const pm10_1 = volume_1 !== 0 ? (dust_1 / volume_1) * Math.pow(10, 6) : 0;
    const pm10_2 = volume_2 !== 0 ? (dust_2 / volume_2) * Math.pow(10, 6) : 0;
    const pm10_3 = volume_3 !== 0 ? (dust_3 / volume_3) * Math.pow(10, 6) : 0;
    const avg_pm10 = (pm10_1 + pm10_2 + pm10_3) / 3;

    const so2Record = { industry_name, location, monitoring_date };
    for (let i = 1; i <= 6; i++) {
        so2Record[`duration_${i}`] = toNumber(so2[`duration_${i}`]);
        so2Record[`es_${i}`] = toNumber(so2[`es_${i}`]);
        so2Record[`cf_${i}`] = toNumber(so2[`cf_${i}`]);
        so2Record[`a_${i}`] = toNumber(so2[`a_${i}`]);
        so2Record[`q_${i}`] = toNumber(so2[`q_${i}`]);
        so2Record[`va_${i}`] = toNumber(so2[`va_${i}`]);
        so2Record[`vs_${i}`] = toNumber(so2[`vs_${i}`]);
        so2Record[`vt_${i}`] = toNumber(so2[`vt_${i}`]);
        so2Record[`so2_${i}`] = toNumber(so2[`so2_${i}`]);
    }
    so2Record.avg_so2 = toNumber(so2.avg_so2);

    const no2Record = { industry_name, location, monitoring_date };
    for (let i = 1; i <= 6; i++) {
        no2Record[`duration_${i}`] = toNumber(no2[`duration_${i}`]);
        no2Record[`as_${i}`] = toNumber(no2[`as_${i}`]);
        no2Record[`cf_${i}`] = toNumber(no2[`cf_${i}`]);
        no2Record[`x_${i}`] = toNumber(no2[`x_${i}`]);
        no2Record[`q_${i}`] = toNumber(no2[`q_${i}`]);
        no2Record[`va_${i}`] = toNumber(no2[`va_${i}`]);
        no2Record[`vs_${i}`] = toNumber(no2[`vs_${i}`]);
        no2Record[`vt_${i}`] = toNumber(no2[`vt_${i}`]);
        no2Record[`no2_${i}`] = toNumber(no2[`no2_${i}`]);
    }
    no2Record.avg_no2 = toNumber(no2.avg_no2);

    const q1_pm25 = toNumber(pm25.q1), q2_pm25 = toNumber(pm25.q2), w1_pm25 = toNumber(pm25.w1), w2_pm25 = toNumber(pm25.w2);
    const T_PM25 = 1440;
    const avg_pm25_flow = (q1_pm25 + q2_pm25) / 2;
    const volume_pm25 = avg_pm25_flow * T_PM25;
    const dust_pm25 = w2_pm25 - w1_pm25;
    const pm25_value = volume_pm25 !== 0 ? (dust_pm25 * Math.pow(10, 6)) / volume_pm25 : 0;

    const connection = await dbPromise.getConnection();
    await connection.beginTransaction();
    try {
        await connection.query('DELETE FROM pm10_data WHERE user_email=? AND industry_name=? AND monitoring_date=?', [user_email, industry_name, monitoring_date]);
        await connection.query('DELETE FROM so2_data WHERE user_email=? AND industry_name=? AND monitoring_date=?', [user_email, industry_name, monitoring_date]);
        await connection.query('DELETE FROM no2_data WHERE user_email=? AND industry_name=? AND monitoring_date=?', [user_email, industry_name, monitoring_date]);
        await connection.query('DELETE FROM pm25_data WHERE user_email=? AND industry_name=? AND monitoring_date=?', [user_email, industry_name, monitoring_date]);

        await connection.query(`
            INSERT INTO pm10_data (
                user_email, industry_name, location, monitoring_date, status,
                q1_1, q2_1, avg_1, volume_1, w1_1, w2_1, dust_1, pm10_1,
                q1_2, q2_2, avg_2, volume_2, w1_2, w2_2, dust_2, pm10_2,
                q1_3, q2_3, avg_3, volume_3, w1_3, w2_3, dust_3, pm10_3,
                avg_pm10
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            user_email, industry_name, location, monitoring_date, status,
            q1_1, q2_1, avg_1, volume_1, w1_1, w2_1, dust_1, pm10_1,
            q1_2, q2_2, avg_2, volume_2, w1_2, w2_2, dust_2, pm10_2,
            q1_3, q2_3, avg_3, volume_3, w1_3, w2_3, dust_3, pm10_3,
            avg_pm10
        ]);

        const so2RecordDb = { ...so2Record, user_email };
        const no2RecordDb = { ...no2Record, user_email };

        await connection.query('INSERT INTO so2_data SET ?', [so2RecordDb]);
        await connection.query('INSERT INTO no2_data SET ?', [no2RecordDb]);
        await connection.query(`
            INSERT INTO pm25_data (
                user_email, industry_name, location, monitoring_date,
                q1, q2, avg, volume,
                w1, w2, dust, pm25
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            user_email, industry_name, location, monitoring_date,
            q1_pm25, q2_pm25, avg_pm25_flow, volume_pm25,
            w1_pm25, w2_pm25, dust_pm25, pm25_value
        ]);

        await connection.commit();
        connection.release();

        return {
            avg_pm10,
            avg_so2: so2Record.avg_so2,
            avg_no2: no2Record.avg_no2,
            pm25: pm25_value
        };
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        throw error;
    }
}

db.getConnection((err, connection) => {
    if (err) {
        console.log('❌ DB Error:', err.message);
    } else {
       console.log(`✅ Connected to MySQL at ${process.env.DB_HOST}`);
        connection.release();
    }
});

// Landing Page Routes
app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ ok: true });
});

function getIndustryProfileByUserEmail(userEmail) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT *
            FROM industry_details
            WHERE user_email = ?
            LIMIT 1
        `;

        db.query(sql, [userEmail], (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result[0] || null);
        });
    });
}

// API Routes for Scheduling
app.get('/api/industries', (req, res) => {
    const sql = 'SELECT industry_name, user_email FROM industry_details';
    db.query(sql, (err, result) => {
        if (err) {
            console.log('Industries Fetch Error:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(result);
    });
});

app.post('/api/schedule-check', (req, res) => {
    const { agencyEmail, industryEmail, industryName, scheduledDate } = req.body;
    
    if (!agencyEmail || !industryEmail || !scheduledDate) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    const normalizedAgencyEmail = requireValidEmail(res, agencyEmail, 'agency email');
    if (!normalizedAgencyEmail) return;
    const normalizedIndustryEmail = requireValidEmail(res, industryEmail, 'industry email');
    if (!normalizedIndustryEmail) return;

    const sql = 'INSERT INTO scheduled_checks (agency_email, industry_name, industry_email, scheduled_date) VALUES (?, ?, ?, ?)';
    db.query(sql, [normalizedAgencyEmail, String(industryName || '').trim(), normalizedIndustryEmail, scheduledDate], (err) => {
        if (err) {
            console.log('Schedule Check Error:', err.message);
            return res.status(500).json({ error: 'Failed to save schedule' });
        }
        res.json({ success: true, message: 'Check scheduled successfully' });
    });
});

app.get('/api/upcoming-checks', (req, res) => {
    const userEmail = req.query.user_email;
    if (!userEmail) return res.status(400).json({ error: 'user_email is required' });
    const normalizedUserEmail = requireValidEmail(res, userEmail, 'user email');
    if (!normalizedUserEmail) return;

    // Using a grouped subquery prevents duplicate rows if an agency saved their profile multiple times
    const sql = `
        SELECT sc.*, ad.agency_name 
        FROM scheduled_checks sc 
        LEFT JOIN (
            SELECT user_email, MAX(agency_name) as agency_name 
            FROM agency_details 
            GROUP BY user_email
        ) ad ON sc.agency_email = ad.user_email 
        WHERE sc.industry_email = ? AND sc.status = "Pending" AND sc.scheduled_date >= CURDATE() 
        ORDER BY sc.scheduled_date ASC
    `;
    db.query(sql, [normalizedUserEmail], (err, result) => {
        if (err) {
            console.log('Upcoming Checks Fetch Error:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ checks: result });
    });
});

app.get('/api/agency-schedules', (req, res) => {
    const agencyEmail = req.query.agency_email;
    if (!agencyEmail) return res.status(400).json({ error: 'agency_email is required' });
    const normalizedAgencyEmail = requireValidEmail(res, agencyEmail, 'agency email');
    if (!normalizedAgencyEmail) return;

    const sql = 'SELECT * FROM scheduled_checks WHERE agency_email = ? ORDER BY scheduled_date DESC, id DESC';
    db.query(sql, [normalizedAgencyEmail], (err, result) => {
        if (err) {
            console.log('Agency Schedules Fetch Error:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ schedules: result });
    });
});

app.put('/api/schedule-check/:id', (req, res) => {
    const id = req.params.id;
    const { status, agencyEmail } = req.body;
    
    if (!status || !agencyEmail) {
        return res.status(400).json({ error: 'status and agencyEmail are required' });
    }

    const normalizedAgencyEmail = requireValidEmail(res, agencyEmail, 'agency email');
    if (!normalizedAgencyEmail) return;

    const sql = 'UPDATE scheduled_checks SET status = ? WHERE id = ? AND agency_email = ?';
    db.query(sql, [status, id, normalizedAgencyEmail], (err) => {
        if (err) {
            console.log('Update Schedule Error:', err.message);
            return res.status(500).json({ error: 'Failed to update schedule status' });
        }
        res.json({ success: true, message: 'Status updated' });
    });
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.warn('Invalid token attempt:', err.message);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// REGISTER with validation
app.post('/register', authLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['Industry', 'Monitoring Agency']).withMessage('Invalid role'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, role } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 12);

        const sql = 'INSERT INTO users (email, password, role) VALUES (?, ?, ?)';
        db.query(sql, [email.toLowerCase(), hashedPassword, role], (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ error: 'User already exists' });
                }
                console.error('Registration error:', err);
                return res.status(500).json({ error: 'Registration failed' });
            }

            // Generate JWT token
            const token = jwt.sign(
                { email: email.toLowerCase(), role },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                message: 'Registered successfully',
                token,
                user: { email: email.toLowerCase(), role }
            });
        });
    } catch (error) {
        console.error('Registration hash error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// LOGIN with validation
app.post('/login', authLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').exists(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    const sql = 'SELECT id, email, password, role FROM users WHERE email = ? LIMIT 1';

    db.query(sql, [normalizedEmail], async (err, result) => {
        if (err) {
            console.error('Login database error:', err);
            return res.status(500).json({ error: 'Login failed' });
        }

        if (result.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const user = result[0];

        try {
            const isValidPassword = await bcrypt.compare(password, user.password);

            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            // Generate JWT token
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            // Store user session
            req.session.userId = user.id;
            req.session.role = user.role;

            let industryProfile = null;
            if (user.role === 'Industry') {
                try {
                    industryProfile = await getIndustryProfileByUserEmail(user.email);
                } catch (profileErr) {
                    console.error('Industry profile fetch error:', profileErr);
                }
            }

            res.json({
                success: true,
                token,
                role: user.role,
                email: user.email,
                hasIndustryProfile: Boolean(industryProfile),
                redirectPage: user.role === 'Industry'
                    ? (industryProfile ? 'industry-reports.html' : 'industry.html')
                    : (user.role === 'Monitoring Agency' ? 'agency.html' : '')
            });
        } catch (error) {
            console.error('Login password verification error:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    });
});

// LOGOUT
app.post('/logout', authenticateToken, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout session destroy error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

// CHECK AGENCY PROFILE
app.post('/check-agency-profile', authenticateToken, [
    body('email').isEmail().normalizeEmail(),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const normalizedEmail = email.toLowerCase();

    db.query('SELECT id FROM agency_details WHERE user_email = ?', [normalizedEmail], (err, result) => {
        if (err) {
            console.error('Check agency profile error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ exists: result.length > 0 });
    });
});

// CHECK INDUSTRY PROFILE
app.post('/check-industry-profile', authenticateToken, [
    body('email').isEmail().normalizeEmail(),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const normalizedEmail = email.toLowerCase();

    db.query('SELECT id FROM industry_details WHERE user_email = ?', [normalizedEmail], (err, result) => {
        if (err) {
            console.error('Check industry profile error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ exists: result.length > 0 });
    });
});

// SAVE AGENCY PROFILE
app.post('/save-agency-profile', authenticateToken, [
    body('user_email').isEmail().normalizeEmail(),
    body('agency_name').isLength({ min: 1 }),
    body('owner_name').isLength({ min: 1 }),
    body('email').isEmail().normalizeEmail(),
    body('phone').isLength({ min: 10 }),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const data = req.body;

    const sql = `
        INSERT INTO agency_details (user_email, agency_name, owner_name, email, phone)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        agency_name = VALUES(agency_name),
        owner_name = VALUES(owner_name),
        email = VALUES(email),
        phone = VALUES(phone)
    `;

    db.query(sql, [
        data.user_email.toLowerCase(),
        data.agency_name.trim(),
        data.owner_name.trim(),
        data.email.toLowerCase(),
        data.phone.trim()
    ], (err) => {
        if (err) {
            console.error('Save agency profile error:', err);
            return res.status(500).json({ error: 'Failed to save profile' });
        }
        res.json({ message: 'Profile saved successfully' });
    });
});

// SAVE INDUSTRY DETAILS
app.post('/save-industry', authenticateToken, [
    body('user_email').isEmail().normalizeEmail(),
    body('industry_name').isLength({ min: 1 }),
    body('industry_type').isLength({ min: 1 }),
    body('industry_id').isLength({ min: 1 }),
    body('address').isLength({ min: 1 }),
    body('contact_name').isLength({ min: 1 }),
    body('role_designation').isLength({ min: 1 }),
    body('email').isEmail().normalizeEmail(),
    body('phone').isLength({ min: 10 }),
    body('monitoring_frequency').isIn(['Daily', 'Weekly', 'Monthly', 'Quarterly']),
    body('notification_pref').isIn(['Email', 'SMS', 'Both']),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const data = req.body;

    const payload = [
        data.user_email.toLowerCase(),
        data.industry_name.trim(),
        data.industry_type.trim(),
        data.industry_id.trim(),
        data.address.trim(),
        data.contact_name.trim(),
        data.role_designation.trim(),
        data.email.toLowerCase(),
        data.phone.trim(),
        data.alt_phone ? data.alt_phone.trim() : '',
        data.monitoring_frequency.trim(),
        data.notification_pref.trim()
    ];

    const checkSql = 'SELECT id FROM industry_details WHERE user_email = ? LIMIT 1';

    db.query(checkSql, [payload[0]], (checkErr, rows) => {
        if (checkErr) {
            console.error('Industry profile check error:', checkErr);
            return res.status(500).json({ error: 'Database error' });
        }

        const hasExistingProfile = rows.length > 0;

        const sql = hasExistingProfile
            ? `
                UPDATE industry_details
                SET industry_name = ?, industry_type = ?, address = ?,
                    contact_name = ?, role_designation = ?, email = ?, phone = ?, alt_phone = ?,
                    monitoring_frequency = ?, notification_pref = ?
                WHERE user_email = ?
            `
            : `
                INSERT INTO industry_details
                (user_email, industry_name, industry_type, industry_id, address,
                 contact_name, role_designation, email, phone, alt_phone,
                 monitoring_frequency, notification_pref)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

        const queryParams = hasExistingProfile
            ? [
                payload[1], payload[2], payload[4], payload[5], payload[6],
                payload[7], payload[8], payload[9], payload[10], payload[11], payload[0]
            ]
            : payload;

        db.query(sql, queryParams, (err) => {
            if (err) {
                console.error('Save industry error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({
                success: true,
                hasIndustryProfile: true,
                redirectPage: 'industry-reports.html',
                message: hasExistingProfile ? 'Profile updated successfully' : 'Profile saved successfully'
            });
        });
    });
});

// SUBMIT INDUSTRY PROFILE FOR REVIEW (same validation as save + review timestamp)
app.post('/submit-industry-review', (req, res) => {
    const data = req.body;

    const missingFields = [];

    if (!data.user_email || !String(data.user_email).trim()) missingFields.push('User Login Email');
    if (!data.industry_name || !String(data.industry_name).trim()) missingFields.push('Industry Name');
    if (!data.industry_type || !String(data.industry_type).trim()) missingFields.push('Industry Type');
    if (!data.industry_id || !String(data.industry_id).trim()) missingFields.push('Industry ID / Registration Number');
    if (!data.address || !String(data.address).trim()) missingFields.push('Location / Address');
    if (!data.contact_name || !String(data.contact_name).trim()) missingFields.push('Contact Person Name');
    if (!data.role_designation || !String(data.role_designation).trim()) missingFields.push('Role / Designation');
    if (!data.email || !String(data.email).trim()) missingFields.push('Email ID');
    if (!data.phone || !String(data.phone).trim()) missingFields.push('Primary Phone Number');
    if (!data.monitoring_frequency || !String(data.monitoring_frequency).trim()) missingFields.push('AQI Monitoring Frequency');
    if (!data.notification_pref || !String(data.notification_pref).trim()) missingFields.push('Notification Preference');

    if (missingFields.length > 0) {
        return res.json({
            error: 'These required fields are missing: ' + missingFields.join(', ')
        });
    }

    const normalizedUserEmail = requireValidEmail(res, data.user_email, 'user login email');
    if (!normalizedUserEmail) return;
    const normalizedContactEmail = requireValidEmail(res, data.email, 'email');
    if (!normalizedContactEmail) return;

    const payload = [
        normalizedUserEmail,
        String(data.industry_name).trim(),
        String(data.industry_type).trim(),
        String(data.industry_id).trim(),
        String(data.address).trim(),
        String(data.contact_name).trim(),
        String(data.role_designation).trim(),
        normalizedContactEmail,
        String(data.phone).trim(),
        data.alt_phone ? String(data.alt_phone).trim() : '',
        String(data.monitoring_frequency).trim(),
        String(data.notification_pref).trim()
    ];

    const checkSql = 'SELECT id FROM industry_details WHERE user_email = ? LIMIT 1';

    db.query(checkSql, [payload[0]], (checkErr, rows) => {
        if (checkErr) {
            console.log('Industry Profile Check Error:', checkErr.message);
            return res.json({ error: 'Database error' });
        }

        const hasExistingProfile = rows.length > 0;

        const sql = hasExistingProfile
            ? `
                UPDATE industry_details
                SET industry_name = ?, industry_type = ?, address = ?,
                    contact_name = ?, role_designation = ?, email = ?, phone = ?, alt_phone = ?,
                    monitoring_frequency = ?, notification_pref = ?, review_submitted_at = NOW()
                WHERE user_email = ?
            `
            : `
                INSERT INTO industry_details
                (user_email, industry_name, industry_type, industry_id, address,
                 contact_name, role_designation, email, phone, alt_phone,
                 monitoring_frequency, notification_pref, review_submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;

        const queryParams = hasExistingProfile
            ? [
                payload[1], payload[2], payload[4], payload[5], payload[6],
                payload[7], payload[8], payload[9], payload[10], payload[11], payload[0]
            ]
            : payload;

        db.query(sql, queryParams, (err) => {
            if (err) {
                console.log('Submit Industry Review Error:', err.message);
                return res.json({ error: 'Database error' });
            }

            res.json({
                success: true,
                hasIndustryProfile: true,
                redirectPage: 'industry-reports.html',
                message: 'Your profile has been submitted for review.'
            });
        });
    });
});

// CHECK INDUSTRY PROFILE STATUS
app.get('/industry-profile-status', async (req, res) => {
    const userEmail = String(req.query.user_email || '').trim();

    if (!userEmail) {
        return res.status(400).json({ error: 'user_email is required' });
    }

    const normalizedUserEmail = requireValidEmail(res, userEmail, 'user email');
    if (!normalizedUserEmail) return;

    try {
        const profile = await getIndustryProfileByUserEmail(normalizedUserEmail);
        res.json({
            hasIndustryProfile: Boolean(profile),
            profile
        });
    } catch (err) {
        console.log('Industry Profile Status Error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// INDUSTRY REPORT LIST
app.get('/industry-reports', async (req, res) => {
    const userEmail = String(req.query.user_email || '').trim();

    if (!userEmail) {
        return res.status(400).json({ error: 'user_email is required' });
    }

    const normalizedUserEmail = requireValidEmail(res, userEmail, 'user email');
    if (!normalizedUserEmail) return;

    try {
        const profile = await getIndustryProfileByUserEmail(normalizedUserEmail);

        if (!profile) {
            return res.json({ reports: [] });
        }

        const reports = [
            {
                id: `profile-${userEmail}`,
                title: `${profile.industry_name} profile report`,
                reportType: 'Industry Profile',
                periodLabel: 'Latest saved profile',
                status: 'Published',
                previewUrl: '',
                downloadUrl: '',
                industryName: profile.industry_name,
                contactName: profile.contact_name,
                email: profile.email,
                phone: profile.phone
            }
        ];

        res.json({ reports });
    } catch (err) {
        console.log('Industry Reports Error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// REPORT INDUSTRY ISSUE
app.post('/report-industry-issue', (req, res) => {
    const { user_email, subject, description } = req.body;

    if (!String(user_email || '').trim() || !String(subject || '').trim() || !String(description || '').trim()) {
        return res.status(400).json({ error: 'Please fill all required fields' });
    }

    if (!requireValidEmail(res, user_email, 'user email')) return;

    res.json({ message: 'Issue submitted successfully' });
});

// GET INDUSTRY NAMES FOR AGENCY DROPDOWN
app.get('/get-industries', (req, res) => {
    const sql = 'SELECT industry_name FROM industry_details';

    db.query(sql, (err, result) => {
        if (err) {
            console.log('Get Industries Error:', err.message);
            return res.json([]);
        }

        res.json(result);
    });
});

// SAVE PM10 DATA
app.post('/save-pm10', (req, res) => {
    const data = req.body;
    const normalizedUserEmail = requireValidEmail(res, data.user_email, 'user email');
    if (!normalizedUserEmail) return;

    const T = 480;

    const q1_1 = parseFloat(data.q1_1) || 0;
    const q2_1 = parseFloat(data.q2_1) || 0;
    const w1_1 = parseFloat(data.w1_1) || 0;
    const w2_1 = parseFloat(data.w2_1) || 0;

    const q1_2 = parseFloat(data.q1_2) || 0;
    const q2_2 = parseFloat(data.q2_2) || 0;
    const w1_2 = parseFloat(data.w1_2) || 0;
    const w2_2 = parseFloat(data.w2_2) || 0;

    const q1_3 = parseFloat(data.q1_3) || 0;
    const q2_3 = parseFloat(data.q2_3) || 0;
    const w1_3 = parseFloat(data.w1_3) || 0;
    const w2_3 = parseFloat(data.w2_3) || 0;

    const avg_1 = (q1_1 + q2_1) / 2;
    const avg_2 = (q1_2 + q2_2) / 2;
    const avg_3 = (q1_3 + q2_3) / 2;

    const volume_1 = avg_1 * T;
    const volume_2 = avg_2 * T;
    const volume_3 = avg_3 * T;

    const dust_1 = w2_1 - w1_1;
    const dust_2 = w2_2 - w1_2;
    const dust_3 = w2_3 - w1_3;

    const pm10_1 = volume_1 !== 0 ? (dust_1 / volume_1) * Math.pow(10, 6) : 0;
    const pm10_2 = volume_2 !== 0 ? (dust_2 / volume_2) * Math.pow(10, 6) : 0;
    const pm10_3 = volume_3 !== 0 ? (dust_3 / volume_3) * Math.pow(10, 6) : 0;

    const avg_pm10 = (pm10_1 + pm10_2 + pm10_3) / 3;

    const sql = `
        INSERT INTO pm10_data (
            user_email, industry_name, location, monitoring_date,
            q1_1, q2_1, avg_1, volume_1, w1_1, w2_1, dust_1, pm10_1,
            q1_2, q2_2, avg_2, volume_2, w1_2, w2_2, dust_2, pm10_2,
            q1_3, q2_3, avg_3, volume_3, w1_3, w2_3, dust_3, pm10_3,
            avg_pm10
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query('DELETE FROM pm10_data WHERE user_email=? AND industry_name=? AND monitoring_date=?', [normalizedUserEmail, data.industry_name || '', data.monitoring_date || ''], () => {
        db.query(sql, [
            normalizedUserEmail,
            data.industry_name,
            data.location,
            data.monitoring_date,
            q1_1, q2_1, avg_1, volume_1, w1_1, w2_1, dust_1, pm10_1,
            q1_2, q2_2, avg_2, volume_2, w1_2, w2_2, dust_2, pm10_2,
            q1_3, q2_3, avg_3, volume_3, w1_3, w2_3, dust_3, pm10_3,
            avg_pm10
        ], (err) => {
            if (err) {
                console.log('Save PM10 Error:', err.message);
                return res.json({ error: 'PM10 save failed' });
            }

            res.json({
                message: 'PM10 data saved successfully',
                pm10_1,
                pm10_2,
                pm10_3,
                avg_pm10
            });
        });
    });
});

// SAVE SO2 DATA
app.post('/save-so2', (req, res) => {
    const data = req.body;
    const cleanData = {};
    for (const key in data) {
        if (['industry_name', 'location', 'monitoring_date', 'user_email'].includes(key)) {
            cleanData[key] = data[key];
        } else {
            cleanData[key] = toNumber(data[key]);
        }
    }
    const normalizedUserEmail = requireValidEmail(res, cleanData.user_email, 'user email');
    if (!normalizedUserEmail) return;
    cleanData.user_email = normalizedUserEmail;
    db.query('DELETE FROM so2_data WHERE user_email=? AND industry_name=? AND monitoring_date=?', [normalizedUserEmail, cleanData.industry_name || '', cleanData.monitoring_date || ''], () => {
        db.query('INSERT INTO so2_data SET ?', cleanData, (err) => {
            if (err) {
                console.log('Save SO2 Error:', err.message);
                return res.json({ error: err.message });
            }
            res.json({ message: 'SO2 data saved successfully' });
        });
    });
});

// SAVE NO2 DATA
app.post('/save-no2', (req, res) => {
    const data = req.body;
    const cleanData = {};
    for (const key in data) {
        if (['industry_name', 'location', 'monitoring_date', 'user_email'].includes(key)) {
            cleanData[key] = data[key];
        } else {
            cleanData[key] = toNumber(data[key]);
        }
    }
    const normalizedUserEmail = requireValidEmail(res, cleanData.user_email, 'user email');
    if (!normalizedUserEmail) return;
    cleanData.user_email = normalizedUserEmail;
    db.query('DELETE FROM no2_data WHERE user_email=? AND industry_name=? AND monitoring_date=?', [normalizedUserEmail, cleanData.industry_name || '', cleanData.monitoring_date || ''], () => {
        db.query('INSERT INTO no2_data SET ?', cleanData, (err) => {
            if (err) {
                console.log('Save NO2 Error:', err.message);
                return res.json({ error: err.message });
            }
            res.json({ message: 'NO2 data saved successfully' });
        });
    });
});

// SAVE PM2.5 DATA
app.post('/save-pm25', (req, res) => {
    const data = req.body;
    const normalizedUserEmail = requireValidEmail(res, data.user_email, 'user email');
    if (!normalizedUserEmail) return;

    const q1 = parseFloat(data.q1) || 0;
    const q2 = parseFloat(data.q2) || 0;
    const w1 = parseFloat(data.w1) || 0;
    const w2 = parseFloat(data.w2) || 0;

    const T = 1440;

    const avg = (q1 + q2) / 2;
    const volume = avg * T;
    const dust = w2 - w1;
    const pm25 = volume !== 0 ? (dust * Math.pow(10, 6)) / volume : 0;

    const sql = `
        INSERT INTO pm25_data (
            user_email, industry_name, location, monitoring_date,
            q1, q2, avg, volume,
            w1, w2, dust, pm25
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query('DELETE FROM pm25_data WHERE user_email=? AND industry_name=? AND monitoring_date=?', [normalizedUserEmail, data.industry_name || '', data.monitoring_date || ''], () => {
        db.query(sql, [
            normalizedUserEmail,
            data.industry_name,
            data.location,
            data.monitoring_date,
            q1,
            q2,
            avg,
            volume,
            w1,
            w2,
            dust,
            pm25
        ], (err) => {
            if (err) {
                console.log('Save PM2.5 Error:', err.message);
                return res.json({ error: 'PM2.5 save failed' });
            }

            res.json({
                message: 'PM2.5 data saved successfully',
                avg,
                volume,
                dust,
                pm25
            });
        });
    });
});

// GET USER REPORTS
app.get('/api/reports', async (req, res) => {
    const userEmail = req.query.user_email;
    if (!userEmail) return res.json({ error: 'user_email required' });
    const normalizedUserEmail = requireValidEmail(res, userEmail, 'user email');
    if (!normalizedUserEmail) return;

    try {
        const profile = await getIndustryProfileByUserEmail(normalizedUserEmail);
        
        let whereClause = "";
        let queryParams = [];

        const industryName = profile && String(profile.industry_name || '').trim();
        if (industryName) {
            whereClause = "WHERE industry_name = ?";
            queryParams = [industryName];
        } else {
            whereClause = "WHERE user_email = ?";
            queryParams = [normalizedUserEmail];
        }

        // Industry users only see published reports. Drafts use status = 'Pending' (see saveAsDraft in app.js).
        db.query(
            `SELECT id, industry_name, avg_pm10,
                    monitoring_date AS periodLabel,
                    'Comprehensive AQI Report' AS reportType,
                    IFNULL(NULLIF(TRIM(status), ''), 'Published') AS status,
                    monitoring_date AS date
             FROM pm10_data ${whereClause}
             AND monitoring_date IS NOT NULL
             AND TRIM(CAST(monitoring_date AS CHAR)) <> ''
             AND avg_pm10 IS NOT NULL
             AND IFNULL(NULLIF(TRIM(status), ''), 'Published') = 'Published'
             ORDER BY id DESC`,
            queryParams,
            (err, results) => {
            if (err) {
                console.log('Get Reports Error:', err.message);
                return res.status(500).json({ error: err.message });
            }
            // Add titles to make it look like the required schema (skip malformed / incomplete rows)
            const formattedReports = (results || [])
                .filter((row) => row && row.id != null && row.periodLabel != null)
                .map((row) => {
                    const dayLabel = formatMonitoringDateForApi(row.periodLabel);
                    if (!dayLabel) return null;
                    return {
                        id: `RPT-COMP-${row.id}`,
                        title: `AQI monitoring summary – ${dayLabel}`,
                        reportType: row.reportType,
                        periodLabel: dayLabel,
                        industry_name: row.industry_name,
                        avg_pm10: row.avg_pm10,
                        status: row.status,
                        date: dayLabel,
                        previewUrl: '',
                        downloadUrl: ''
                    };
                })
                .filter(Boolean);
            res.json(formattedReports);
        });
    } catch (err) {
        console.log('Get Reports Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE REPORT
app.delete('/api/reports/:id', (req, res) => {
    let rawId = req.params.id;
    // Extract numeric ID (e.g., RPT-0001 -> 1, RPT-COMP-5 -> 5)
    let id = rawId.replace(/\D/g, '');
    
    if (!id) {
        return res.status(400).json({ error: 'Invalid report ID' });
    }

    // We assume reports are tied to pm10_data (and equivalently so2, no2, pm25 with same ID or monitoring date, but for simplicity we just delete from pm10_data to hide it from the list since the dashboard uses pm10_data to list reports)
    db.query('DELETE FROM pm10_data WHERE id = ?', [id], (err, _result) => {
        if (err) {
            console.log('Delete Report Error:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Report deleted successfully' });
    });
});

// GET FULL REPORT SUMMARY FOR VIEW/DOWNLOAD
app.get('/api/reports/summary/:id', async (req, res) => {
    let rawId = req.params.id;
    let id = rawId.replace(/\D/g, '');
    
    if (!id) return res.status(400).json({ error: 'Invalid report ID' });

    try {
        const [pm10Rows] = await dbPromise.query(`SELECT * FROM pm10_data WHERE id = ?`, [id]);
        if (pm10Rows.length === 0) return res.status(404).json({ error: 'Report not found' });
        
        const pm10Data = pm10Rows[0];
        const industry_name = pm10Data.industry_name;
        const monitoring_date = pm10Data.monitoring_date;
        const location = pm10Data.location;

        const [so2Rows] = await dbPromise.query(`SELECT avg_so2 FROM so2_data WHERE industry_name = ? AND monitoring_date = ? LIMIT 1`, [industry_name, monitoring_date]);
        const [no2Rows] = await dbPromise.query(`SELECT avg_no2 FROM no2_data WHERE industry_name = ? AND monitoring_date = ? LIMIT 1`, [industry_name, monitoring_date]);
        const [pm25Rows] = await dbPromise.query(`SELECT pm25 FROM pm25_data WHERE industry_name = ? AND monitoring_date = ? LIMIT 1`, [industry_name, monitoring_date]);

        const toNumber = (val) => val !== null && val !== undefined ? Number(val) : 0;

        res.json({
            industryName: industry_name || 'N/A',
            location: location || 'N/A',
            monitoringDate: monitoring_date || 'N/A',
            pm10Avg: pm10Data.avg_pm10 !== null ? toNumber(pm10Data.avg_pm10).toFixed(2) : '0.00',
            so2Avg: (so2Rows.length > 0 && so2Rows[0].avg_so2 !== null) ? toNumber(so2Rows[0].avg_so2).toFixed(2) : '0.00',
            no2Avg: (no2Rows.length > 0 && no2Rows[0].avg_no2 !== null) ? toNumber(no2Rows[0].avg_no2).toFixed(2) : '0.00',
            pm25Val: (pm25Rows.length > 0 && pm25Rows[0].pm25 !== null) ? toNumber(pm25Rows[0].pm25).toFixed(2) : '0.00'
        });

    } catch (err) {
        console.error('Fetch Summary Error:', err.message);
        res.status(500).json({ error: 'Database error fetching report summary' });
    }
});

// AGENCY DASHBOARD DATA
app.get('/agency-dashboard-data', async (req, res) => {
    const userEmail = req.query.user_email;
    if (!userEmail) return res.status(400).json({ error: 'user_email required' });
    const normalizedUserEmail = requireValidEmail(res, userEmail, 'user email');
    if (!normalizedUserEmail) return;

    try {
        const [rows] = await dbPromise.query(`
            SELECT id, industry_name, location, monitoring_date, status
            FROM pm10_data
            WHERE user_email = ?
            ORDER BY id DESC
        `, [normalizedUserEmail]);

        let pendingCount = 0;
        let overdueCount = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const reports = rows.map((row, index) => {
            const rowStatus = row.status || 'Published';
            const monDate = new Date(row.monitoring_date);
            
            if (rowStatus === 'Pending') {
                pendingCount++;
                if (!isNaN(monDate.getTime()) && monDate < today) {
                    overdueCount++;
                }
            }

            return {
                reportId: `RPT-${String(row.id || index + 1).padStart(4, '0')}`,
                companyName: row.industry_name,
                reportType: 'AQI Monitoring Report',
                generatedBy: 'Monitoring Agency',
                status: rowStatus,
                monitoringDate: row.monitoring_date,
                location: row.location
            };
        });

        res.json({
            success: true,
            summary: {
                totalReports: reports.length,
                activeReports: reports.length,
                pendingReports: pendingCount,
                overdueReports: overdueCount
            },
            reports
        });
    } catch (error) {
        console.log('Agency Dashboard Data Error:', error.message);
        res.status(500).json({ error: 'Unable to load agency dashboard data' });
    }
});

// SAVE FULL AGENCY REPORT DATA AT ONCE
app.post('/save-agency-report', async (req, res) => {
    const data = req.body || {};
    const normalizedUserEmail = requireValidEmail(res, data.user_email, 'user email');
    if (!normalizedUserEmail) return;
    const industry_name = String(data.industry_name || '').trim();
    const location = String(data.location || '').trim();
    const monitoring_date = String(data.monitoring_date || '').trim();

    if (!industry_name || !location || !monitoring_date) {
        return res.status(400).json({ error: 'Industry, location and monitoring date are required' });
    }

    try {
        const metrics = await insertAgencyCombinedReport({
            ...data,
            user_email: normalizedUserEmail
        });
        res.json({
            success: true,
            message: 'Agency report saved successfully',
            redirectPage: 'agency-dash.html',
            metrics
        });
    } catch (error) {
        console.log('Save Agency Report Error:', error.message);
        res.status(500).json({ error: 'Agency report save failed' });
    }
});

// START SERVER
if (process.env.VERCEL !== '1') {
// CSRF Protection
// const csrfProtection = csrf({ cookie: true });

// HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.version
    });
});

// METRICS ENDPOINT (for monitoring)
app.get('/metrics', (req, res) => {
    res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// ERROR HANDLING MIDDLEWARE
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 HANDLER
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// START SERVER
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`EnviroMonitor server running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
    console.log(`Metrics available at http://localhost:${PORT}/metrics`);
});

// GRACEFUL SHUTDOWN
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

module.exports = app;
