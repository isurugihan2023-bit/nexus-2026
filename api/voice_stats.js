export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const range = (req.query?.range || 'week').toLowerCase().trim();
    const validRange = ['week', 'month', 'all'].includes(range) ? range : 'week';
    const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit, 10) || 6));

    // Try fetching live stats from bot daemon
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const upstream = await fetch(`http://157.90.181.183:23063/api/voice_stats?range=${validRange}&limit=${limit}`, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (upstream.ok) {
            const data = await upstream.json();
            if (data && ((data.leaderboard && data.leaderboard.length > 0) || (data.top && data.top.length > 0))) {
                return res.status(200).json({
                    ...data,
                    stale: false
                });
            }
        }
    } catch (e) {
        // Upstream offline or timeout, fall through to verified range snapshot
    }

    // Baseline Fallback Snapshots per range
    const FALLBACK_SNAPSHOTS = {
        week: [
            { rank: 1, prev_rank: 2, user_id: "718472993873068155", display_name: "kiri putha", handle: "thivinasamarakkody", avatar_url: "https://cdn.discordapp.com/avatars/718472993873068155/6069c1d26139c718aa89ed111e15b833.png?size=128", total_seconds: 78420, is_live: false, live_since: null },
            { rank: 2, prev_rank: 1, user_id: "706113392167092276", display_name: "local leclerc", handle: "leda6605", avatar_url: "https://cdn.discordapp.com/avatars/706113392167092276/46fcbfa2b31c84fd30d5f43131cac9dc.png?size=128", total_seconds: 52140, is_live: false, live_since: null },
            { rank: 3, prev_rank: 3, user_id: "928546532037394453", display_name: "N3WB", handle: "newb0000", avatar_url: "https://cdn.discordapp.com/avatars/928546532037394453/2b6b502870443b1e12f1b3b02bf65157.png?size=128", total_seconds: 43200, is_live: false, live_since: null },
            { rank: 4, prev_rank: null, user_id: "909069118349639751", display_name: "Pegging Boy", handle: "cr4zy12", avatar_url: "https://cdn.discordapp.com/avatars/909069118349639751/89f7749f1e8243d3576acc06eebb2e57.png?size=128", total_seconds: 28980, is_live: false, live_since: null },
            { rank: 5, prev_rank: 4, user_id: "1226896502216069130", display_name: "Animo", handle: "4nimo.", avatar_url: "https://cdn.discordapp.com/avatars/1226896502216069130/14b1a6863a88ad6d3ae93635f51c387b.png?size=128", total_seconds: 21600, is_live: false, live_since: null },
            { rank: 6, prev_rank: null, user_id: "1334780362731294812", display_name: "SL_LIDDA", handle: "sl_lidda", avatar_url: "https://cdn.discordapp.com/avatars/1334780362731294812/694cbff5dfbe134c4a18dc78740f0236.png?size=128", total_seconds: 14760, is_live: false, live_since: null }
        ],
        month: [
            { rank: 1, prev_rank: 1, user_id: "718472993873068155", display_name: "kiri putha", handle: "thivinasamarakkody", avatar_url: "https://cdn.discordapp.com/avatars/718472993873068155/6069c1d26139c718aa89ed111e15b833.png?size=128", total_seconds: 215400, is_live: false, live_since: null },
            { rank: 2, prev_rank: 2, user_id: "706113392167092276", display_name: "local leclerc", handle: "leda6605", avatar_url: "https://cdn.discordapp.com/avatars/706113392167092276/46fcbfa2b31c84fd30d5f43131cac9dc.png?size=128", total_seconds: 148200, is_live: false, live_since: null },
            { rank: 3, prev_rank: 3, user_id: "928546532037394453", display_name: "N3WB", handle: "newb0000", avatar_url: "https://cdn.discordapp.com/avatars/928546532037394453/2b6b502870443b1e12f1b3b02bf65157.png?size=128", total_seconds: 121500, is_live: false, live_since: null },
            { rank: 4, prev_rank: 5, user_id: "909069118349639751", display_name: "Pegging Boy", handle: "cr4zy12", avatar_url: "https://cdn.discordapp.com/avatars/909069118349639751/89f7749f1e8243d3576acc06eebb2e57.png?size=128", total_seconds: 82100, is_live: false, live_since: null },
            { rank: 5, prev_rank: 4, user_id: "1226896502216069130", display_name: "Animo", handle: "4nimo.", avatar_url: "https://cdn.discordapp.com/avatars/1226896502216069130/14b1a6863a88ad6d3ae93635f51c387b.png?size=128", total_seconds: 61400, is_live: false, live_since: null },
            { rank: 6, prev_rank: null, user_id: "1334780362731294812", display_name: "SL_LIDDA", handle: "sl_lidda", avatar_url: "https://cdn.discordapp.com/avatars/1334780362731294812/694cbff5dfbe134c4a18dc78740f0236.png?size=128", total_seconds: 41200, is_live: false, live_since: null }
        ],
        all: [
            { rank: 1, prev_rank: 1, user_id: "718472993873068155", display_name: "kiri putha", handle: "thivinasamarakkody", avatar_url: "https://cdn.discordapp.com/avatars/718472993873068155/6069c1d26139c718aa89ed111e15b833.png?size=128", total_seconds: 489376, is_live: false, live_since: null },
            { rank: 2, prev_rank: 2, user_id: "706113392167092276", display_name: "local leclerc", handle: "leda6605", avatar_url: "https://cdn.discordapp.com/avatars/706113392167092276/46fcbfa2b31c84fd30d5f43131cac9dc.png?size=128", total_seconds: 329116, is_live: false, live_since: null },
            { rank: 3, prev_rank: 3, user_id: "928546532037394453", display_name: "N3WB", handle: "newb0000", avatar_url: "https://cdn.discordapp.com/avatars/928546532037394453/2b6b502870443b1e12f1b3b02bf65157.png?size=128", total_seconds: 291568, is_live: false, live_since: null },
            { rank: 4, prev_rank: 4, user_id: "909069118349639751", display_name: "Pegging Boy", handle: "cr4zy12", avatar_url: "https://cdn.discordapp.com/avatars/909069118349639751/89f7749f1e8243d3576acc06eebb2e57.png?size=128", total_seconds: 177518, is_live: false, live_since: null },
            { rank: 5, prev_rank: 5, user_id: "1226896502216069130", display_name: "Animo", handle: "4nimo.", avatar_url: "https://cdn.discordapp.com/avatars/1226896502216069130/14b1a6863a88ad6d3ae93635f51c387b.png?size=128", total_seconds: 159480, is_live: false, live_since: null },
            { rank: 6, prev_rank: 6, user_id: "1334780362731294812", display_name: "SL_LIDDA", handle: "sl_lidda", avatar_url: "https://cdn.discordapp.com/avatars/1334780362731294812/694cbff5dfbe134c4a18dc78740f0236.png?size=128", total_seconds: 103500, is_live: false, live_since: null }
        ]
    };

    const selectedList = FALLBACK_SNAPSHOTS[validRange] || FALLBACK_SNAPSHOTS.week;

    const topCompat = selectedList.map(u => {
        const h = Math.floor(u.total_seconds / 3600);
        const m = Math.floor((u.total_seconds % 3600) / 60);
        return {
            name: u.display_name,
            avatar: u.avatar_url,
            time: `${h}h ${m}m`
        };
    });

    return res.status(200).json({
        success: true,
        range: validRange,
        generated_at: 1789733576000,
        stale: true,
        leaderboard: selectedList.slice(0, limit),
        top: topCompat,
        live: []
    });
}
