"""
Term Normalization Utility for Auto Loan Scrapers

Maps non-standard loan terms to industry-standard terms (36/48/60/72/84 months)
for consistent rate matching across all lenders.

This module is designed to be used in the myLenders tool (PyQt6 scraper application)
to normalize terms before inserting rate data into the Supabase database.

Usage:
    from normalize_terms import normalize_term_to_standard, normalize_rate_terms

    # Normalize a single term
    normalized = normalize_term_to_standard(66)  # Returns 60

    # Normalize rate data
    rate_data = {"termMonths": 66, "apr": 5.99}
    normalized_data = normalize_rate_terms(rate_data)
"""

from typing import Dict, Any, Tuple

# Industry-standard auto loan terms (in months)
INDUSTRY_STANDARD_TERMS = [36, 48, 60, 72, 84]


def normalize_term_to_standard(term: int) -> int:
    """
    Normalize a loan term to the nearest industry standard.

    Args:
        term: The original term in months

    Returns:
        The nearest industry-standard term

    Raises:
        ValueError: If term is invalid (negative)

    Examples:
        >>> normalize_term_to_standard(66)
        60
        >>> normalize_term_to_standard(75)
        72
        >>> normalize_term_to_standard(48)
        48
        >>> normalize_term_to_standard(0)
        36
    """
    # Handle edge case: 0 months maps to shortest standard term (36)
    if term == 0:
        return INDUSTRY_STANDARD_TERMS[0]

    if term < 0:
        raise ValueError(f"Invalid term: {term}. Term must be a non-negative number.")

    # Find the nearest standard term
    nearest_term = INDUSTRY_STANDARD_TERMS[0]
    min_distance = abs(term - nearest_term)

    for standard_term in INDUSTRY_STANDARD_TERMS:
        distance = abs(term - standard_term)

        if distance < min_distance:
            min_distance = distance
            nearest_term = standard_term
        elif distance == min_distance:
            # Tie-breaker: prefer shorter term (more conservative)
            nearest_term = min(nearest_term, standard_term)

    return nearest_term


def normalize_term_range(term_min: int, term_max: int) -> Tuple[int, int]:
    """
    Normalize a term range to industry-standard boundaries.

    Args:
        term_min: Minimum term in months
        term_max: Maximum term in months

    Returns:
        Tuple of (normalized_min, normalized_max)

    Raises:
        ValueError: If range is invalid (min > max)

    Examples:
        >>> normalize_term_range(37, 60)
        (36, 60)
        >>> normalize_term_range(61, 75)
        (60, 72)
    """
    if term_min > term_max:
        raise ValueError(f"Invalid range: min ({term_min}) > max ({term_max})")

    return (
        normalize_term_to_standard(term_min),
        normalize_term_to_standard(term_max)
    )


def is_standard_term(term: int) -> bool:
    """
    Check if a term is already an industry standard.

    Args:
        term: The term to check

    Returns:
        True if term is a standard value

    Examples:
        >>> is_standard_term(60)
        True
        >>> is_standard_term(66)
        False
    """
    return term in INDUSTRY_STANDARD_TERMS


def get_term_normalization_info(term: int) -> Dict[str, Any]:
    """
    Get detailed information about term normalization.

    Args:
        term: The original term

    Returns:
        Dictionary with original, normalized, distance, and wasModified keys

    Examples:
        >>> get_term_normalization_info(66)
        {'original': 66, 'normalized': 60, 'distance': 6, 'wasModified': True}
    """
    normalized = normalize_term_to_standard(term)
    return {
        'original': term,
        'normalized': normalized,
        'distance': abs(term - normalized),
        'wasModified': term != normalized
    }


def normalize_rate_terms(rate_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize rate data for database insertion.
    Handles both exact terms and term ranges.

    Args:
        rate_data: Rate data dictionary from scraper
            - Must include either 'termMonths' (exact) or 'termMin'/'termMax' (range)

    Returns:
        Normalized rate data with 'term_range_min', 'term_range_max', and 'term_label'

    Raises:
        ValueError: If required term fields are missing

    Examples:
        >>> rate_data = {"termMonths": 66, "apr": 5.99, "vehicle_condition": "new"}
        >>> normalize_rate_terms(rate_data)
        {
            "termMonths": 66,
            "apr": 5.99,
            "vehicle_condition": "new",
            "term_range_min": 60,
            "term_range_max": 60,
            "term_label": "60 Months"
        }
    """
    result = rate_data.copy()

    # Handle exact term (single value)
    if 'termMonths' in rate_data:
        normalized = normalize_term_to_standard(rate_data['termMonths'])
        term_min = normalized
        term_max = normalized
    # Handle term range
    elif 'termMin' in rate_data and 'termMax' in rate_data:
        term_min, term_max = normalize_term_range(
            rate_data['termMin'],
            rate_data['termMax']
        )
    # Missing term data
    else:
        raise ValueError('Rate data must include either termMonths or termMin/termMax')

    result['term_range_min'] = term_min
    result['term_range_max'] = term_max
    result['term_label'] = f"{term_min} Months" if term_min == term_max else f"{term_min}-{term_max} Months"

    return result


if __name__ == '__main__':
    # Example usage and testing
    print("=== Term Normalization Examples ===\n")

    # SCCU example
    print("SCCU Terms:")
    sccu_terms = [48, 66, 75, 84]
    for term in sccu_terms:
        info = get_term_normalization_info(term)
        print(f"  {info['original']} months → {info['normalized']} months (distance: {info['distance']})")

    print("\nNormalized SCCU Rate Data:")
    sccu_rate = {
        "termMonths": 66,
        "apr": 5.99,
        "vehicle_condition": "new",
        "loan_type": "purchase",
        "source": "SCCU"
    }
    normalized = normalize_rate_terms(sccu_rate)
    print(f"  Input:  {sccu_rate}")
    print(f"  Output: {normalized}")

    print("\nTerm Range Example:")
    range_rate = {
        "termMin": 37,
        "termMax": 60,
        "apr": 4.29,
        "vehicle_condition": "new",
        "source": "NFCU"
    }
    normalized_range = normalize_rate_terms(range_rate)
    print(f"  Input:  {range_rate}")
    print(f"  Output: {normalized_range}")
