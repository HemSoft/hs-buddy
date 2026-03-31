Feature: Budget Discovery
  Finds Copilot-related budgets from GitHub billing API responses
  with SKU preference and flexible entity name matching.

  Scenario: Prefer premium SKU over generic copilot
    Given a budget list with both "copilot_premium_request" and "copilot_business" SKUs
    When searching for a copilot budget without entity filter
    Then the premium SKU budget should be returned

  Scenario: Match entity name with substring flexibility
    Given a budget with entity name "Relias"
    And an entity filter of "relias-engineering"
    When searching for a copilot budget
    Then the budget should match because the entity is a substring of the filter

  Scenario: Return undefined when no copilot budget exists
    Given a budget list with only "actions_compute" SKUs
    When searching for a copilot budget without entity filter
    Then the result should be undefined

  Scenario: Find budget on first page of paginated results
    Given the API returns a matching budget on page 1
    When searching across pages
    Then the match should be returned from page 1
    And only 1 page should be fetched

  Scenario: Search across multiple pages until found
    Given the API returns no match on pages 1 and 2
    And a matching budget on page 3
    When searching across pages with max 10
    Then the match should be returned from page 3
    And exactly 3 pages should be fetched

  Scenario: Return null when budget not found in any page
    Given the API returns 3 pages with no copilot budgets
    When searching across pages with max 3
    Then the result should be null
    And all 3 pages should be fetched
