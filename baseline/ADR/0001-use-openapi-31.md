# 0001: Use OpenAPI 3.1 + Problem Details

- Status: Accepted (2025-11-10)
- Context: We need portable API contracts and consistent error format.
- Decision: Use OpenAPI 3.1; errors use application/problem+json (RFC 9457).
- Consequences: Clients can generate types; consistent error parsing.
