#!/usr/bin/env python3
"""
LinkedIn Profile Scraper

This script scrapes LinkedIn profiles using selenium and the linkedin_scraper library.
It's designed to be called from Node.js as a child process.

Usage:
    python linkedin_scraper.py <linkedin_url> [--email EMAIL] [--password PASSWORD]

Output:
    JSON to stdout with profile data or error information
"""

import sys
import os
import json
import argparse
import time
from datetime import datetime

def find_chromium_binary():
    """Find Chromium binary path - works on Nix/Railway and local systems."""
    import shutil
    import subprocess
    
    # Check environment variable first
    if os.environ.get('CHROMIUM_BIN'):
        return os.environ.get('CHROMIUM_BIN')
    
    # Common Chromium paths to check
    candidates = [
        'chromium',
        'chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/root/.nix-profile/bin/chromium',
    ]
    
    # Try to find chromium in PATH
    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            return path
    
    # On Nix, find chromium in nix store
    try:
        result = subprocess.run(['which', 'chromium'], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except:
        pass
    
    return None


def find_chromedriver():
    """Find chromedriver binary path - works on Nix/Railway and local systems."""
    import shutil
    
    # Check environment variable first
    if os.environ.get('CHROMEDRIVER_PATH'):
        return os.environ.get('CHROMEDRIVER_PATH')
    
    # Common chromedriver paths to check
    candidates = [
        'chromedriver',
        '/usr/bin/chromedriver',
        '/root/.nix-profile/bin/chromedriver',
    ]
    
    # Try to find chromedriver in PATH
    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            return path
    
    return None


def setup_driver():
    """Set up Chrome/Chromium driver with headless options for server environment."""
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")  # New headless mode
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-infobars")
    chrome_options.add_argument("--remote-debugging-port=9222")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    # Set user agent to avoid detection
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    # Find and set Chromium binary path (important for Nix/Railway)
    chromium_path = find_chromium_binary()
    if chromium_path:
        print(f"Using Chromium binary: {chromium_path}", file=sys.stderr)
        chrome_options.binary_location = chromium_path
    else:
        print("Warning: Could not find Chromium binary, using default", file=sys.stderr)
    
    # Find and use system chromedriver (preferred for Nix environments)
    chromedriver_path = find_chromedriver()
    if chromedriver_path:
        print(f"Using chromedriver: {chromedriver_path}", file=sys.stderr)
        service = Service(executable_path=chromedriver_path)
        driver = webdriver.Chrome(service=service, options=chrome_options)
    else:
        print("Using default chromedriver from PATH", file=sys.stderr)
        # Try webdriver_manager as fallback
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            from webdriver_manager.core.os_manager import ChromeType
            service = Service(ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
        except Exception as e:
            print(f"webdriver_manager failed ({e}), trying default", file=sys.stderr)
            driver = webdriver.Chrome(options=chrome_options)
    
    # Additional stealth settings
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    return driver


def login_to_linkedin(driver, email, password):
    """Log into LinkedIn."""
    from linkedin_scraper import actions
    
    try:
        actions.login(driver, email, password)
        # Wait for login to complete
        time.sleep(3)
        return True
    except Exception as e:
        return False


def scrape_profile(linkedin_url, email=None, password=None):
    """
    Scrape a LinkedIn profile and return structured data.
    
    Args:
        linkedin_url: The LinkedIn profile URL to scrape
        email: LinkedIn account email (optional, uses env var if not provided)
        password: LinkedIn account password (optional, uses env var if not provided)
    
    Returns:
        dict: Structured profile data
    """
    from linkedin_scraper import Person
    
    # Get credentials from args or environment
    email = email or os.environ.get('LINKEDIN_EMAIL')
    password = password or os.environ.get('LINKEDIN_PASSWORD')
    
    if not email or not password:
        return {
            "success": False,
            "error": "LinkedIn credentials not provided. Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD environment variables.",
            "error_type": "AUTH_MISSING"
        }
    
    driver = None
    try:
        # Set up driver
        driver = setup_driver()
        
        # Login to LinkedIn
        if not login_to_linkedin(driver, email, password):
            return {
                "success": False,
                "error": "Failed to login to LinkedIn. Check credentials.",
                "error_type": "AUTH_FAILED"
            }
        
        # Add delay to avoid rate limiting
        time.sleep(2)
        
        # Scrape the profile
        person = Person(linkedin_url, driver=driver, scrape=True, close_on_complete=False)
        
        # Extract experiences
        experiences = []
        if hasattr(person, 'experiences') and person.experiences:
            for exp in person.experiences:
                experiences.append({
                    "company": getattr(exp, 'institution_name', None) or getattr(exp, 'company', None),
                    "title": getattr(exp, 'position_title', None) or getattr(exp, 'title', None),
                    "duration": getattr(exp, 'duration', None),
                    "description": getattr(exp, 'description', None),
                    "location": getattr(exp, 'location', None),
                    "from_date": getattr(exp, 'from_date', None),
                    "to_date": getattr(exp, 'to_date', None),
                })
        
        # Extract education
        educations = []
        if hasattr(person, 'educations') and person.educations:
            for edu in person.educations:
                educations.append({
                    "school": getattr(edu, 'institution_name', None) or getattr(edu, 'school', None),
                    "degree": getattr(edu, 'degree', None),
                    "field": getattr(edu, 'field_of_study', None),
                    "from_date": getattr(edu, 'from_date', None),
                    "to_date": getattr(edu, 'to_date', None),
                    "description": getattr(edu, 'description', None),
                })
        
        # Extract interests
        interests = []
        if hasattr(person, 'interests') and person.interests:
            for interest in person.interests:
                interests.append(getattr(interest, 'title', str(interest)))
        
        # Extract accomplishments
        accomplishments = []
        if hasattr(person, 'accomplishments') and person.accomplishments:
            for acc in person.accomplishments:
                accomplishments.append({
                    "category": getattr(acc, 'category', None),
                    "title": getattr(acc, 'title', str(acc)),
                })
        
        # Build the result
        result = {
            "success": True,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "linkedin_url": linkedin_url,
            "data": {
                "name": person.name,
                "headline": getattr(person, 'job_title', None),
                "about": person.about if hasattr(person, 'about') else None,
                "location": getattr(person, 'location', None),
                "company": person.company,
                "job_title": person.job_title,
                "experiences": experiences,
                "educations": educations,
                "interests": interests,
                "accomplishments": accomplishments,
                "connections": getattr(person, 'connections', None),
            }
        }
        
        return result
        
    except Exception as e:
        error_type = "SCRAPE_ERROR"
        if "rate" in str(e).lower() or "limit" in str(e).lower():
            error_type = "RATE_LIMITED"
        elif "auth" in str(e).lower() or "login" in str(e).lower():
            error_type = "AUTH_FAILED"
        elif "not found" in str(e).lower() or "404" in str(e):
            error_type = "PROFILE_NOT_FOUND"
            
        return {
            "success": False,
            "error": str(e),
            "error_type": error_type,
            "linkedin_url": linkedin_url
        }
        
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


def main():
    parser = argparse.ArgumentParser(description='Scrape LinkedIn profiles')
    parser.add_argument('linkedin_url', help='LinkedIn profile URL to scrape')
    parser.add_argument('--email', help='LinkedIn email (or use LINKEDIN_EMAIL env var)')
    parser.add_argument('--password', help='LinkedIn password (or use LINKEDIN_PASSWORD env var)')
    
    args = parser.parse_args()
    
    # Validate URL
    if 'linkedin.com' not in args.linkedin_url:
        result = {
            "success": False,
            "error": "Invalid LinkedIn URL",
            "error_type": "INVALID_URL"
        }
        print(json.dumps(result))
        sys.exit(1)
    
    # Scrape the profile
    result = scrape_profile(
        args.linkedin_url,
        email=args.email,
        password=args.password
    )
    
    # Output JSON to stdout
    print(json.dumps(result, indent=2, default=str))
    
    # Exit with appropriate code
    sys.exit(0 if result.get('success') else 1)


if __name__ == '__main__':
    main()

