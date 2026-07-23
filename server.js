const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Mock API endpoint for public stats (Backend Implementation)
app.get('/api/public_stats', (req, res) => {
    // In a real bot, these would be fetched from a database or memory
    res.json({
        total_servers: 1450,
        total_users: 125000,
        total_commands: 215,
        ping: 2,
        uptime_seconds: 3600 * 24 * 5 + 3600 * 2 + 60 * 15 // 5 days, 2 hours, 15 minutes
    });
});



app.listen(port, () => {
    console.log(`Backend Server is running perfectly on http://localhost:${port}`);
    console.log('Serving frontend from /public');
});
