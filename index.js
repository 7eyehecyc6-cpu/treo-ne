const { Client } = require('discord.js-selfbot-v13');
const express = require('express');
const play = require('play-dl');

const TOKEN = process.env.DISCORD_TOKEN || '';
const GUILD_ID = process.env.GUILD_ID || '';
const CHANNEL_ID = process.env.CHANNEL_ID || '';
const PORT = process.env.PORT || 8080;
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '';

if (!TOKEN || !GUILD_ID || !CHANNEL_ID) {
    console.error('[VOICE] Missing required env vars');
    process.exit(1);
}

const app = express();
app.use(express.json());

const client = new Client({
    checkUpdate: false,
    ws: {
        properties: {
            $os: 'Windows',
            $browser: 'Discord Client',
            $device: 'Desktop',
            $referrer: '',
            $referring_domain: ''
        }
    }
});

let voiceConnection = null;
let currentDispatcher = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 50;

async function joinVoice() {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            const fetched = await client.guilds.fetch(GUILD_ID).catch(() => null);
            if (!fetched) return false;
        }
        
        const g = client.guilds.cache.get(GUILD_ID);
        const channel = await g.channels.fetch(CHANNEL_ID).catch(() => null);
        
        if (!channel || !channel.isVoice()) return false;

        console.log(`[VOICE] Joining: ${g.name} -> ${channel.name}`);

        voiceConnection = await client.voice.joinChannel(channel, {
            selfDeaf: true,
            selfMute: false,
            selfVideo: false
        });

        reconnectAttempts = 0;

        voiceConnection.on('ready', () => {
            console.log('[VOICE] ✅ Voice connection READY — 24/7 mode active');
        });

        voiceConnection.on('disconnect', () => {
            voiceConnection = null;
            scheduleReconnect();
        });

        return true;
    } catch (e) {
        console.error(`[VOICE] Join error: ${e.message}`);
        voiceConnection = null;
        scheduleReconnect();
        return false;
    }
}

function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    if (reconnectAttempts > MAX_RECONNECT) {
        reconnectAttempts = 0;
        reconnectTimer = setTimeout(() => joinVoice(), 300000);
        return;
    }
    reconnectTimer = setTimeout(() => joinVoice(), delay);
}

client.on('ready', async () => {
    console.log(`[VOICE] Logged in as: ${client.user.tag}`);
    await joinVoice();
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.id !== client.user?.id) return;
    if (!newState.channelId) {
        voiceConnection = null;
        scheduleReconnect();
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        voiceReady: Boolean(voiceConnection?.ready),
        timestamp: new Date().toISOString()
    });
});

app.get('/ping', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/play', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Missing url' });
    }

    try {
        if (!voiceConnection) {
            await joinVoice();
            if (!voiceConnection) {
                return res.status(500).json({ error: 'Voice connection not active' });
            }
        }

        console.log(`[MUSIC] Playing stream from: ${url}`);
        let streamSource = url;

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const streamData = await play.stream(url);
            streamSource = streamData.stream;
        }

        if (currentDispatcher) {
            try { currentDispatcher.destroy(); } catch(e) {}
        }

        currentDispatcher = voiceConnection.play(streamSource, { type: 'opus/webm', volume: 1 });

        currentDispatcher.on('finish', () => {
            console.log('[MUSIC] Finished playing track.');
        });

        currentDispatcher.on('error', (err) => {
            console.error('[MUSIC] Playback error:', err);
        });

        return res.json({ success: true, message: 'Playing audio now' });
    } catch (err) {
        console.error('[MUSIC] Error in /play:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`[HTTP] Web server & API listening on port ${PORT}`));

function startKeepAlivePing() {
    if (!APP_URL) return;
    const fullUrl = APP_URL.startsWith('http') ? APP_URL : `https://${APP_URL}`;
    const pingEndpoint = `${fullUrl.replace(/\/+$/, '')}/ping`;
    setInterval(() => {
        const requester = pingEndpoint.startsWith('https') ? require('https') : require('http');
        requester.get(pingEndpoint, (res) => {}).on('error', (err) => {});
    }, 10 * 60 * 1000);
}

startKeepAlivePing();
client.login(TOKEN).catch(() => process.exit(1));
