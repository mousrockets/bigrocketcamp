"""Read three public profile pages with ordinary HTTP access; never read Epic IDs or tokens.

Stdlib only. Output is transient public HTML for the Site's validated snapshot import.
No redirects, browser impersonation, proxy changes or retry after a refusal.
"""
import concurrent.futures
import json
import urllib.error
import urllib.request

PROFILES = [
    ('chat-pris-tea', 'https://rlstats.net/profile/Epic/chat-pris-tea'),
    ('nokouki', 'https://rlstats.net/profile/Epic/nokouki'),
    ('kevin-74000', 'https://rlstats.net/profile/PS4/kevin-74000'),
]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def read_profile(profile):
    player, url = profile
    try:
        request = urllib.request.Request(url, headers={
            'User-Agent': 'RL-Pompes/1.0 (+https://example.chatgpt.site)',
            'Accept': 'text/html',
        })
        with urllib.request.build_opener(NoRedirect).open(request, timeout=12) as response:
            if response.status != 200 or not response.headers.get('Content-Type', '').lower().startswith('text/html'):
                raise ValueError('Public profile unavailable')
            body = response.read(512001)
            if len(body) > 512000:
                raise ValueError('Public profile too large')
            return {'player': player, 'html': body.decode('utf-8')}
    except Exception as error:
        return {'player': player, 'error': 'HTTP '+str(error.code) if isinstance(error, urllib.error.HTTPError) else 'Public profile unavailable'}

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(read_profile, PROFILES))
    print(json.dumps({'pages': [p for p in results if 'html' in p], 'errors': [p for p in results if 'error' in p]}))
