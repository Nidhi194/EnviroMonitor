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
