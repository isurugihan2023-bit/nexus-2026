export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=15, stale-while-revalidate=30');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const upstream = await fetch('http://157.90.181.183:23063/api/voice_live', {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (upstream.ok) {
            const data = await upstream.json();
            return res.status(200).json(data);
        }
    } catch (e) {
        // Fall through to empty live state
    }

    return res.status(200).json({
        count: 0,
        members: []
    });
}
