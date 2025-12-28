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
    """Log into LinkedIn with detailed error reporting."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    
    try:
        print(f"Navigating to LinkedIn login page...", file=sys.stderr)
        driver.get("https://www.linkedin.com/login")
        time.sleep(2)
        
        # Take screenshot of login page for debugging
        print(f"Current URL: {driver.current_url}", file=sys.stderr)
        print(f"Page title: {driver.title}", file=sys.stderr)
        
        # Helper function to set input value using JavaScript (bypasses anti-automation)
        def set_input_value(element, value):
            """Use JavaScript to set input value and trigger proper events."""
            driver.execute_script("""
                var element = arguments[0];
                var value = arguments[1];
                
                // Focus the element
                element.focus();
                
                // Clear existing value
                element.value = '';
                
                // Set the new value
                element.value = value;
                
                // Trigger input events so React/Angular/Vue detect the change
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            """, element, value)
        
        # Find and fill email field
        print(f"Looking for email field...", file=sys.stderr)
        try:
            email_field = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "username"))
            )
            time.sleep(1)
            
            # Use JavaScript to set the value
            set_input_value(email_field, email)
            time.sleep(0.5)
            
            # Verify email was entered
            entered_value = email_field.get_attribute('value')
            print(f"Email entered via JS: {email}", file=sys.stderr)
            print(f"Email field value: {entered_value}", file=sys.stderr)
            
            if not entered_value:
                # Fallback: try send_keys with ActionChains
                print(f"JS failed, trying ActionChains...", file=sys.stderr)
                from selenium.webdriver.common.action_chains import ActionChains
                actions = ActionChains(driver)
                actions.move_to_element(email_field)
                actions.click()
                actions.send_keys(email)
                actions.perform()
                time.sleep(0.5)
                entered_value = email_field.get_attribute('value')
                print(f"Email field value after ActionChains: {entered_value}", file=sys.stderr)
            
            if not entered_value:
                return False, "Could not enter email - anti-automation blocking input"
                
        except Exception as e:
            print(f"Failed to find/fill email field: {e}", file=sys.stderr)
            return False, f"Could not find email input field: {e}"
        
        # Find and fill password field
        print(f"Looking for password field...", file=sys.stderr)
        try:
            password_field = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.ID, "password"))
            )
            time.sleep(0.5)
            
            # Use JavaScript to set the value
            set_input_value(password_field, password)
            time.sleep(0.5)
            
            # Verify password was entered
            entered_value = password_field.get_attribute('value')
            print(f"Password entered via JS (length: {len(password)})", file=sys.stderr)
            print(f"Password field length: {len(entered_value)}", file=sys.stderr)
            
            if not entered_value:
                # Fallback: try ActionChains
                print(f"JS failed for password, trying ActionChains...", file=sys.stderr)
                from selenium.webdriver.common.action_chains import ActionChains
                actions = ActionChains(driver)
                actions.move_to_element(password_field)
                actions.click()
                actions.send_keys(password)
                actions.perform()
                time.sleep(0.5)
                entered_value = password_field.get_attribute('value')
                print(f"Password field length after ActionChains: {len(entered_value)}", file=sys.stderr)
            
            if not entered_value:
                return False, "Could not enter password - anti-automation blocking input"
                
        except Exception as e:
            print(f"Failed to find/fill password field: {e}", file=sys.stderr)
            return False, f"Could not find password input field: {e}"
        
        # Click login button
        print(f"Clicking login button...", file=sys.stderr)
        try:
            login_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            login_button.click()
        except Exception as e:
            print(f"Failed to click login button: {e}", file=sys.stderr)
            return False, "Could not click login button"
        
        # Wait for login to process
        print(f"Waiting for login to complete...", file=sys.stderr)
        time.sleep(5)
        
        # Check current URL to determine login status
        current_url = driver.current_url
        print(f"Post-login URL: {current_url}", file=sys.stderr)
        print(f"Post-login title: {driver.title}", file=sys.stderr)
        
        # Check for various login states
        if "feed" in current_url or "mynetwork" in current_url or "/in/" in current_url:
            print(f"Login successful! Redirected to: {current_url}", file=sys.stderr)
            return True, None
        
        # Check for security checkpoint
        if "checkpoint" in current_url:
            print(f"Security checkpoint detected!", file=sys.stderr)
            return False, "LinkedIn security checkpoint - account may need verification"
        
        # Check for CAPTCHA
        if "challenge" in current_url:
            print(f"CAPTCHA challenge detected!", file=sys.stderr)
            return False, "CAPTCHA challenge - LinkedIn blocking automated access"
        
        # Check for 2FA
        if "two-step-verification" in current_url or "verification" in current_url:
            print(f"2FA verification required!", file=sys.stderr)
            return False, "Two-factor authentication required - disable 2FA on this account"
        
        # Check for wrong password
        try:
            error_element = driver.find_element(By.CSS_SELECTOR, ".form__label--error, #error-for-password, #error-for-username, .alert-content")
            error_text = error_element.text
            print(f"Login error message: {error_text}", file=sys.stderr)
            return False, f"LinkedIn error: {error_text}"
        except:
            pass
        
        # Still on login page = login failed
        if "login" in current_url:
            print(f"Still on login page - credentials may be wrong", file=sys.stderr)
            # Try to get any visible error
            try:
                page_source = driver.page_source[:2000]
                if "incorrect" in page_source.lower() or "wrong" in page_source.lower():
                    return False, "Incorrect email or password"
                if "recognize" in page_source.lower():
                    return False, "LinkedIn doesn't recognize this email"
            except:
                pass
            return False, "Login failed - still on login page"
        
        print(f"Unexpected post-login state, URL: {current_url}", file=sys.stderr)
        return False, f"Unexpected state after login attempt: {current_url}"
        
    except Exception as e:
        print(f"Login exception: {str(e)}", file=sys.stderr)
        return False, str(e)


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
        login_success, login_error = login_to_linkedin(driver, email, password)
        if not login_success:
            return {
                "success": False,
                "error": login_error or "Failed to login to LinkedIn",
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


def load_cookies_to_driver(driver, cookies):
    """Load cookies into the driver session."""
    if not cookies:
        return False
    
    try:
        # Navigate to LinkedIn first (required for cookies)
        driver.get("https://www.linkedin.com")
        time.sleep(1)
        
        # Add each cookie
        for cookie in cookies:
            try:
                cookie_dict = {
                    'name': cookie.get('name'),
                    'value': cookie.get('value'),
                    'domain': cookie.get('domain', '.linkedin.com'),
                    'path': cookie.get('path', '/'),
                }
                
                # Add optional fields
                if 'expiry' in cookie:
                    cookie_dict['expiry'] = cookie['expiry']
                if 'httpOnly' in cookie:
                    cookie_dict['httpOnly'] = cookie['httpOnly']
                if 'secure' in cookie:
                    cookie_dict['secure'] = cookie['secure']
                
                driver.add_cookie(cookie_dict)
                
            except Exception as e:
                print(f"Failed to add cookie {cookie.get('name')}: {e}", file=sys.stderr)
        
        print(f"Loaded {len(cookies)} cookies into driver", file=sys.stderr)
        return True
        
    except Exception as e:
        print(f"Failed to load cookies: {e}", file=sys.stderr)
        return False


def get_cookies_from_driver(driver):
    """Extract all cookies from the driver session."""
    try:
        cookies = driver.get_cookies()
        print(f"Extracted {len(cookies)} cookies from driver", file=sys.stderr)
        return cookies
    except Exception as e:
        print(f"Failed to extract cookies: {e}", file=sys.stderr)
        return []


def wait_for_verification_code(gmail_email, gmail_app_password, timeout=60):
    """
    Wait for a LinkedIn verification code via email (IMAP).
    This is a Python implementation matching the Node.js emailVerification service.
    """
    import imaplib
    import email
    from email.header import decode_header
    import re
    
    print(f"Waiting for verification code at {gmail_email}...", file=sys.stderr)
    
    start_time = time.time()
    check_interval = 3  # Check every 3 seconds
    
    while time.time() - start_time < timeout:
        try:
            # Connect to Gmail IMAP
            mail = imaplib.IMAP4_SSL('imap.gmail.com')
            mail.login(gmail_email, gmail_app_password)
            mail.select('INBOX')
            
            # Search for recent unread emails from LinkedIn
            result, data = mail.search(None, '(UNSEEN FROM "linkedin.com")')
            
            if result == 'OK':
                email_ids = data[0].split()
                
                for email_id in email_ids:
                    # Fetch the email
                    result, msg_data = mail.fetch(email_id, '(RFC822)')
                    
                    if result == 'OK':
                        raw_email = msg_data[0][1]
                        msg = email.message_from_bytes(raw_email)
                        
                        # Get subject
                        subject = decode_header(msg['Subject'])[0][0]
                        if isinstance(subject, bytes):
                            subject = subject.decode()
                        
                        # Check if it's a verification email
                        if 'verification' in subject.lower():
                            print(f"Found verification email: {subject}", file=sys.stderr)
                            
                            # Get email body
                            body = ""
                            if msg.is_multipart():
                                for part in msg.walk():
                                    if part.get_content_type() == "text/plain":
                                        body = part.get_payload(decode=True).decode()
                                        break
                            else:
                                body = msg.get_payload(decode=True).decode()
                            
                            # Extract code (6 digits)
                            code_patterns = [
                                r'verification code:?\s*(\d{6})',
                                r'your code:?\s*(\d{6})',
                                r'code:?\s*(\d{6})',
                                r'(\d{6})\s*is your',
                            ]
                            
                            for pattern in code_patterns:
                                match = re.search(pattern, body, re.IGNORECASE)
                                if match:
                                    code = match.group(1)
                                    print(f"Extracted verification code: {code}", file=sys.stderr)
                                    mail.logout()
                                    return code
            
            mail.logout()
            
        except Exception as e:
            print(f"Error checking email: {e}", file=sys.stderr)
        
        # Wait before next check
        time.sleep(check_interval)
    
    print(f"No verification code found after {timeout}s", file=sys.stderr)
    return None


def scrape_with_session(linkedin_url, email, password, cookies=None, gmail_email=None, gmail_app_password=None):
    """
    Enhanced scraper that supports session cookies and email verification.
    """
    driver = None
    
    try:
        # Set up driver
        driver = setup_driver()
        
        # Try to use existing session first
        if cookies:
            print("Attempting to use existing session cookies...", file=sys.stderr)
            load_cookies_to_driver(driver, cookies)
            
            # Navigate to profile to test session
            driver.get(linkedin_url)
            time.sleep(3)
            
            # Check if we're logged in (not redirected to login page)
            if "login" not in driver.current_url and "checkpoint" not in driver.current_url:
                print("Session cookies still valid!", file=sys.stderr)
            else:
                print("Session expired, need to login", file=sys.stderr)
                cookies = None  # Force login
        
        # Login if no valid session
        if not cookies:
            print("Logging in to LinkedIn...", file=sys.stderr)
            login_success, login_error = login_to_linkedin(driver, email, password)
            
            if not login_success:
                # Check if verification is required
                if "checkpoint" in driver.current_url or "verification" in driver.current_url:
                    print("Verification required!", file=sys.stderr)
                    
                    if gmail_email and gmail_app_password:
                        print("Attempting email verification...", file=sys.stderr)
                        
                        # Wait for verification code via email
                        code = wait_for_verification_code(gmail_email, gmail_app_password)
                        
                        if code:
                            # Submit verification code
                            try:
                                code_input = driver.find_element("id", "input__email_verification_pin")
                                code_input.send_keys(code)
                                time.sleep(1)
                                
                                submit_btn = driver.find_element("css selector", "button[type='submit']")
                                submit_btn.click()
                                time.sleep(5)
                                
                                # Check if verification succeeded
                                if "feed" in driver.current_url or "/in/" in driver.current_url:
                                    print("Verification successful!", file=sys.stderr)
                                    login_success = True
                                else:
                                    return {
                                        "success": False,
                                        "error": "Verification code submission failed",
                                        "error_type": "VERIFICATION_FAILED"
                                    }
                                    
                            except Exception as e:
                                return {
                                    "success": False,
                                    "error": f"Failed to submit verification code: {e}",
                                    "error_type": "VERIFICATION_ERROR"
                                }
                        else:
                            return {
                                "success": False,
                                "error": "No verification code received",
                                "error_type": "NO_VERIFICATION_CODE"
                            }
                    else:
                        return {
                            "success": False,
                            "error": login_error or "Verification required but no Gmail credentials provided",
                            "error_type": "VERIFICATION_REQUIRED"
                        }
                else:
                    return {
                        "success": False,
                        "error": login_error or "Failed to login to LinkedIn",
                        "error_type": "AUTH_FAILED"
                    }
        
        # Save updated cookies
        new_cookies = get_cookies_from_driver(driver)
        
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
            "cookies": new_cookies,  # Return updated cookies
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
    parser = argparse.ArgumentParser(description='Scrape LinkedIn profiles with session management')
    parser.add_argument('--stdin', action='store_true', help='Read JSON input from stdin')
    parser.add_argument('linkedin_url', nargs='?', help='LinkedIn profile URL to scrape')
    parser.add_argument('--email', help='LinkedIn email (or use LINKEDIN_EMAIL env var)')
    parser.add_argument('--password', help='LinkedIn password (or use LINKEDIN_PASSWORD env var)')
    
    args = parser.parse_args()
    
    # Read input from stdin (new mode for session management)
    if args.stdin:
        try:
            input_data = json.loads(sys.stdin.read())
            linkedin_url = input_data.get('url')
            email = input_data.get('email')
            password = input_data.get('password')
            cookies = input_data.get('cookies')
            gmail_email = input_data.get('gmail_email')
            gmail_app_password = input_data.get('gmail_app_password')
            
            result = scrape_with_session(
                linkedin_url,
                email,
                password,
                cookies=cookies,
                gmail_email=gmail_email,
                gmail_app_password=gmail_app_password
            )
            
            print(json.dumps(result, indent=2, default=str))
            sys.exit(0 if result.get('success') else 1)
            
        except Exception as e:
            result = {
                "success": False,
                "error": f"Failed to parse stdin input: {e}",
                "error_type": "INPUT_ERROR"
            }
            print(json.dumps(result))
            sys.exit(1)
    
    # Original command-line mode (legacy support)
    if not args.linkedin_url:
        result = {
            "success": False,
            "error": "No LinkedIn URL provided",
            "error_type": "INVALID_INPUT"
        }
        print(json.dumps(result))
        sys.exit(1)
    
    # Validate URL
    if 'linkedin.com' not in args.linkedin_url:
        result = {
            "success": False,
            "error": "Invalid LinkedIn URL",
            "error_type": "INVALID_URL"
        }
        print(json.dumps(result))
        sys.exit(1)
    
    # Scrape the profile (legacy mode)
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

