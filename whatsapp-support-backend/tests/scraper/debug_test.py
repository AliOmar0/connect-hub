import sys
import os
os.environ.setdefault('SUPABASE_URL', 'https://test.supabase.co')
os.environ.setdefault('SUPABASE_KEY', 'test-key')
os.environ.setdefault('SUPABASE_JWT_SECRET', 'test-secret')
os.environ.setdefault('OPENROUTER_API_KEY', 'test-key')
sys.path.insert(0, r'C:\Users\Mustafa\Desktop\pib_final\verson2\connect-hub\whatsapp-support-backend')

import asyncio
import httpx
import importlib.util

SCRAPER_DIR = r'C:\Users\Mustafa\Desktop\pib_final\verson2\connect-hub\whatsapp-support-backend\app\core\scraper'

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

fetcher = load_module('fetcher', os.path.join(SCRAPER_DIR, 'fetcher.py'))
extractor = load_module('extractor', os.path.join(SCRAPER_DIR, 'extractor.py'))
frontier = load_module('frontier', os.path.join(SCRAPER_DIR, 'frontier.py'))
robots = load_module('robots', os.path.join(SCRAPER_DIR, 'robots.py'))
rate_limiter = load_module('rate_limiter', os.path.join(SCRAPER_DIR, 'rate_limiter.py'))
fields = load_module('fields', os.path.join(SCRAPER_DIR, 'fields.py'))

async def test():
    from app.core.config import settings
    base_url = settings.BANK_WEBSITE_BASE_URL
    base_domain = base_url.split('://')[-1].split('/')[0]
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            policy = await robots.fetch_robots_policy(base_url, settings.SCRAPER_USER_AGENT, client)
            delay = robots.effective_delay(policy, settings.SCRAPER_MIN_REQUEST_DELAY_SECONDS)
        except Exception as e:
            delay = settings.SCRAPER_MIN_REQUEST_DELAY_SECONDS
            policy = None
        
        rl = rate_limiter.RateLimiter(delay)
        f = frontier.CrawlFrontier(start_url=base_url, max_depth=1, max_pages=2)
        
        queue = [(base_url, 0)]
        results = []
        
        while queue and f.remaining_budget() > 0:
            url, depth = queue.pop(0)
            
            if not f.should_visit(url, depth):
                continue
            
            f.mark_visited(url)
            print('  Waiting rate limiter...', flush=True)
            await rl.wait()
            print('  Rate limiter done', flush=True)
            
            print('Scraping: ' + url, flush=True)
            
            try:
                fetch_result = await fetcher.fetch_with_retry(
                    url, client,
                    settings.SCRAPER_MAX_RETRIES,
                    settings.SCRAPER_RETRY_BASE_BACKOFF_SECONDS,
                )
            except fetcher.FetchError as e:
                print('  ERROR: ' + str(e), flush=True)
                continue
            
            extracted = extractor.extract_content(fetch_result.html)
            title = extracted.title[:50]
            # Replace non-ASCII chars for console output
            title = ''.join(c if ord(c) < 128 else '?' for c in title)
            print('  Title: ' + title, flush=True)
            
            structured_fields = fields.extract_structured_fields(extracted.main_text)
            print('  Fields: ' + str(structured_fields), flush=True)
            
            # Discover links
            links = extractor.discover_links(fetch_result.html, url)
            print('  Raw links: ' + str(len(links)), flush=True)
            for l in links[:5]:
                print('    ' + l, flush=True)
            same_domain_links = frontier.filter_same_domain(links, base_domain)
            non_excluded_links = frontier.filter_excluded_paths(same_domain_links)
            # Use robots.is_allowed directly to avoid package import issues
            allowed_links = [l for l in non_excluded_links if robots.is_allowed(policy, l, settings.SCRAPER_USER_AGENT)]
            
            print('  Links found: ' + str(len(links)) + ' -> same_domain: ' + str(len(same_domain_links)) + ' -> non_excluded: ' + str(len(non_excluded_links)) + ' -> allowed: ' + str(len(allowed_links)), flush=True)
            for l in allowed_links[:5]:
                print('    Allowed: ' + l, flush=True)
            
            for link in allowed_links:
                if f.should_visit(link, depth + 1):
                    queue.append((link, depth + 1))
            
            print('  Queue size after: ' + str(len(queue)), flush=True)
        
        print('Total: ' + str(len(results)), flush=True)

asyncio.run(test())
print('Done!', flush=True)