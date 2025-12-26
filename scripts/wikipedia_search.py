#!/usr/bin/env python3
"""
Wikipedia Search Script

Searches Wikipedia for information about people and companies.
Returns structured JSON data for integration into the research stack.

Usage:
    python wikipedia_search.py "Harris Stolzenberg" --type person
    python wikipedia_search.py "Pear VC" --type company
"""

import sys
import json
import argparse
from datetime import datetime

def search_wikipedia(query, search_type='person'):
    """
    Search Wikipedia for a person or company.
    
    Args:
        query: Name of person or company to search
        search_type: 'person' or 'company'
    
    Returns:
        dict: Structured data from Wikipedia
    """
    import wikipediaapi
    
    # Initialize Wikipedia API with a proper user agent
    wiki = wikipediaapi.Wikipedia(
        user_agent='PartnerBot/1.0 (https://github.com/foundry-bot; contact@foundry.com)',
        language='en'
    )
    
    result = {
        "success": False,
        "query": query,
        "search_type": search_type,
        "searched_at": datetime.utcnow().isoformat() + "Z",
        "data": None,
        "error": None
    }
    
    try:
        # Search for the page
        page = wiki.page(query)
        
        if not page.exists():
            # Try alternative searches
            alternatives = try_alternative_searches(wiki, query, search_type)
            if alternatives:
                page = alternatives
            else:
                result["error"] = f"No Wikipedia page found for '{query}'"
                result["error_type"] = "NOT_FOUND"
                return result
        
        # Extract data from the page
        data = {
            "title": page.title,
            "url": page.fullurl,
            "summary": page.summary[:2000] if page.summary else None,  # First 2000 chars
            "full_text_preview": extract_relevant_sections(page, search_type),
            "categories": extract_categories(page),
            "links": extract_useful_links(page, search_type),
            "sections": extract_section_titles(page),
        }
        
        # Extract specific data based on type
        if search_type == 'person':
            data["career_info"] = extract_career_info(page)
            data["education"] = extract_education_info(page)
        elif search_type == 'company':
            data["company_info"] = extract_company_info(page)
        
        result["success"] = True
        result["data"] = data
        
    except Exception as e:
        result["error"] = str(e)
        result["error_type"] = "SEARCH_ERROR"
    
    return result


def try_alternative_searches(wiki, query, search_type):
    """Try alternative search queries if the main one fails."""
    alternatives = []
    
    if search_type == 'person':
        # Try adding common suffixes
        alternatives = [
            f"{query} (investor)",
            f"{query} (venture capitalist)",
            f"{query} (entrepreneur)",
            f"{query} (businessperson)",
        ]
    elif search_type == 'company':
        alternatives = [
            f"{query} (company)",
            f"{query} (venture capital)",
            f"{query} (firm)",
        ]
    
    for alt_query in alternatives:
        page = wiki.page(alt_query)
        if page.exists():
            return page
    
    return None


def iterate_sections(sections):
    """Helper to iterate over sections regardless of type."""
    if hasattr(sections, 'values'):
        return sections.values()
    elif hasattr(sections, '__iter__'):
        return sections
    return []


def extract_relevant_sections(page, search_type):
    """Extract the most relevant sections based on search type."""
    relevant_keywords = {
        'person': ['career', 'biography', 'early life', 'education', 'investments', 
                   'notable investments', 'professional', 'business', 'work'],
        'company': ['history', 'founding', 'investments', 'portfolio', 'notable investments',
                    'leadership', 'founders', 'products', 'services', 'funding']
    }
    
    keywords = relevant_keywords.get(search_type, relevant_keywords['person'])
    extracted = []
    
    def process_sections(sections, depth=0):
        for section in iterate_sections(sections):
            section_lower = section.title.lower()
            if any(kw in section_lower for kw in keywords):
                text = section.text[:1500] if section.text else ""
                if text:
                    extracted.append({
                        "title": section.title,
                        "content": text
                    })
            # Process subsections
            if depth < 2:
                process_sections(section.sections, depth + 1)
    
    process_sections(page.sections)
    return extracted[:5]  # Return top 5 relevant sections


def extract_categories(page):
    """Extract Wikipedia categories."""
    try:
        categories = list(page.categories.keys())
        # Filter out meta categories
        useful_categories = [
            cat.replace('Category:', '') 
            for cat in categories 
            if not any(skip in cat.lower() for skip in ['stub', 'articles', 'pages', 'wikidata', 'cs1'])
        ]
        return useful_categories[:10]  # Return top 10
    except:
        return []


def extract_useful_links(page, search_type):
    """Extract links to related pages."""
    try:
        links = list(page.links.keys())
        
        # Keywords to prioritize
        priority_keywords = {
            'person': ['venture', 'capital', 'invest', 'fund', 'company', 'startup', 'entrepreneur'],
            'company': ['founder', 'ceo', 'portfolio', 'investment', 'fund', 'partner']
        }
        
        keywords = priority_keywords.get(search_type, [])
        
        # Score and sort links
        scored_links = []
        for link in links:
            link_lower = link.lower()
            score = sum(1 for kw in keywords if kw in link_lower)
            if score > 0:
                scored_links.append((link, score))
        
        scored_links.sort(key=lambda x: x[1], reverse=True)
        return [link for link, score in scored_links[:15]]
    except:
        return []


def extract_section_titles(page):
    """Extract all section titles for reference."""
    titles = []
    
    def get_titles(sections, prefix=""):
        for section in iterate_sections(sections):
            titles.append(f"{prefix}{section.title}")
            get_titles(section.sections, prefix + "  ")
    
    get_titles(page.sections)
    return titles[:20]  # Limit to 20


def extract_career_info(page):
    """Extract career-related information for a person."""
    career_info = {
        "positions": [],
        "companies": [],
        "achievements": []
    }
    
    # Look for career-related sections
    career_keywords = ['career', 'professional', 'business', 'work', 'position']
    
    def search_sections(sections):
        for section in iterate_sections(sections):
            title_lower = section.title.lower()
            if any(kw in title_lower for kw in career_keywords):
                # Extract text and look for patterns
                text = section.text or ""
                career_info["raw_career"] = text[:2000]
            search_sections(section.sections)
    
    search_sections(page.sections)
    return career_info


def extract_education_info(page):
    """Extract education information for a person."""
    education_info = {
        "institutions": [],
        "degrees": []
    }
    
    # Look for education section
    def search_sections(sections):
        for section in iterate_sections(sections):
            if 'education' in section.title.lower() or 'early life' in section.title.lower():
                education_info["raw_education"] = (section.text or "")[:1000]
            search_sections(section.sections)
    
    search_sections(page.sections)
    return education_info


def extract_company_info(page):
    """Extract company-specific information."""
    company_info = {
        "founding": None,
        "headquarters": None,
        "key_people": [],
        "industry": None,
        "description": None
    }
    
    # The summary often contains key company info
    summary = page.summary or ""
    company_info["description"] = summary[:1000]
    
    # Look for history/founding sections
    def search_sections(sections):
        for section in iterate_sections(sections):
            title_lower = section.title.lower()
            if 'history' in title_lower or 'founding' in title_lower:
                company_info["founding_info"] = (section.text or "")[:1500]
            elif 'portfolio' in title_lower or 'investment' in title_lower:
                company_info["portfolio_info"] = (section.text or "")[:1500]
            search_sections(section.sections)
    
    search_sections(page.sections)
    return company_info


def main():
    parser = argparse.ArgumentParser(description='Search Wikipedia for person or company info')
    parser.add_argument('query', help='Name of person or company to search')
    parser.add_argument('--type', choices=['person', 'company'], default='person',
                        help='Type of search: person or company')
    
    args = parser.parse_args()
    
    result = search_wikipedia(args.query, args.type)
    
    # Output JSON
    print(json.dumps(result, indent=2, default=str))
    
    # Exit with appropriate code
    sys.exit(0 if result.get('success') else 1)


if __name__ == '__main__':
    main()

