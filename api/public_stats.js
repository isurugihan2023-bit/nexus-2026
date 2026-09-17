export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const upstream = await fetch('http://157.90.181.183:23063/api/public_stats', {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: `Bot API returned status ${upstream.status}` });
        }

        const data = await upstream.json();
        return res.status(200).json(data);
    } catch (err) {
        return res.status(502).json({ error: 'Failed to connect to bot server', details: err.message });
    }
}
